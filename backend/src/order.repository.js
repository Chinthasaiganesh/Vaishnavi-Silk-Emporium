import { db, transaction } from "./db.js";
import { nowIso } from "./utils.js";

export const ORDER_STATUSES = ["PENDING", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "REFUNDED"];
const cancellableStatuses = ["PENDING", "PROCESSING", "PACKED"];

export async function listOrders(userId) {
  return await db.prepare("SELECT o.*, COUNT(oi.OrderItemId) AS ItemCount FROM Orders o LEFT JOIN OrderItems oi ON oi.OrderId = o.OrderId WHERE o.UserId = ? GROUP BY o.OrderId ORDER BY datetime(o.CreatedDate) DESC").all(userId);
}

export async function listAllOrders({ q = "", status = "" } = {}) {
  const orders = await db.prepare(`
    SELECT o.*, u.Username, u.FullName, u.Email, u.MobileNumber, COUNT(oi.OrderItemId) AS ItemCount
    FROM Orders o JOIN Users u ON u.UserId = o.UserId
    LEFT JOIN OrderItems oi ON oi.OrderId = o.OrderId
    GROUP BY o.OrderId, u.UserId
    ORDER BY datetime(o.CreatedDate) DESC
  `).all();
  const query = q.trim().toLowerCase();
  return orders.filter((order) => {
    const statusMatch = !status || order.OrderStatus === status;
    const text = `${order.OrderNumber} ${order.Username} ${order.FullName} ${order.Email}`.toLowerCase();
    const queryMatch = !query || text.includes(query);
    return statusMatch && queryMatch;
  });
}

export async function getOrder(userId, orderId) {
  const order = await db.prepare("SELECT o.*, a.FullName, a.MobileNumber, a.AddressLine1, a.AddressLine2, a.City, a.State, a.PostalCode, a.Country FROM Orders o JOIN Addresses a ON a.AddressId = o.AddressId WHERE o.UserId = ? AND o.OrderId = ?").get(userId, orderId);
  if (!order) return null;
  return { ...order, items: await db.prepare("SELECT * FROM OrderItems WHERE OrderId = ? ORDER BY OrderItemId").all(orderId), history: await getOrderStatusHistory(orderId) };
}

export async function getAdminOrder(orderId) {
  const order = await db.prepare("SELECT o.*, u.Username, u.FullName AS CustomerName, u.Email, u.MobileNumber AS CustomerMobile, a.FullName, a.MobileNumber, a.AddressLine1, a.AddressLine2, a.City, a.State, a.PostalCode, a.Country FROM Orders o JOIN Users u ON u.UserId = o.UserId JOIN Addresses a ON a.AddressId = o.AddressId WHERE o.OrderId = ?").get(orderId);
  if (!order) return null;
  return { ...order, items: await db.prepare("SELECT * FROM OrderItems WHERE OrderId = ? ORDER BY OrderItemId").all(orderId), history: await getOrderStatusHistory(orderId) };
}

export async function getOrderStatusHistory(orderId) {
  return await db.prepare("SELECT h.*, u.Username FROM OrderStatusHistory h LEFT JOIN Users u ON u.UserId = h.ChangedBy WHERE h.OrderId = ? ORDER BY datetime(h.ChangedAt), h.StatusHistoryId").all(orderId);
}

export async function getOrderByIdempotencyKey(userId, idempotencyKey) {
  if (!idempotencyKey) return null;
  const existing = await db.prepare("SELECT OrderId FROM Orders WHERE UserId = ? AND IdempotencyKey = ?").get(userId, idempotencyKey);
  return existing ? await getOrder(userId, existing.OrderId) : null;
}

export async function createOrder({ userId, addressId, items, subtotal, shipping, discount, grandTotal, idempotencyKey, requestId }) {
  console.info(JSON.stringify({ level: "info", message: "Entered Order Repository", requestId, userId, addressId, itemCount: items.length }));
  const timestamp = nowIso();
  const orderId = await transaction(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.get("SELECT OrderId FROM Orders WHERE UserId = ? AND IdempotencyKey = ?", [userId, idempotencyKey]);
      if (existing) return existing.OrderId;
    }
    const next = await tx.get("SELECT COALESCE(MAX(OrderId), 0) + 1 AS nextId FROM Orders");
    const orderNumber = `VSE-${new Date().getFullYear()}-${String(next.nextId).padStart(6, "0")}`;
    const orderResult = await tx.run("INSERT INTO Orders (UserId, AddressId, OrderNumber, IdempotencyKey, PaymentMethod, OrderStatus, SubTotal, ShippingAmount, DiscountAmount, GrandTotal, CreatedDate, UpdatedDate) VALUES (?, ?, ?, ?, 'COD', 'PENDING', ?, ?, ?, ?, ?, ?)", [userId, addressId, orderNumber, idempotencyKey || null, subtotal, shipping, discount, grandTotal, timestamp, timestamp]);
    console.info(JSON.stringify({ level: "info", message: "Order database row created", requestId, orderId: orderResult.lastInsertRowid, orderNumber, subtotal, grandTotal }));
    for (const item of items) {
      await tx.run("INSERT INTO OrderItems (OrderId, ProductId, ProductName, ProductPrice, Quantity, LineTotal, CreatedDate) VALUES (?, ?, ?, ?, ?, ?, ?)", [orderResult.lastInsertRowid, item.ProductId, item.ProductName, item.Price, item.Quantity, item.Price * item.Quantity, timestamp]);
      const result = await tx.run("UPDATE Inventory SET CurrentStock = CurrentStock - ?, AvailableStock = AvailableStock - ?, Status = CASE WHEN CurrentStock - ? = 0 THEN 'OUT_OF_STOCK' WHEN CurrentStock - ? <= 5 THEN 'LOW_STOCK' ELSE 'IN_STOCK' END, UpdatedDate = ? WHERE ProductId = ? AND AvailableStock >= ?", [item.Quantity, item.Quantity, item.Quantity, item.Quantity, timestamp, item.ProductId, item.Quantity]);
      if (result.changes !== 1) throw Object.assign(new Error("Insufficient inventory available."), { status: 409 });
      await tx.run("UPDATE Products SET Quantity = Quantity - ?, UpdatedDate = ? WHERE ProductId = ?", [item.Quantity, timestamp, item.ProductId]);
      await tx.run("INSERT INTO OrderAuditLog (OrderId, UserId, Action, CreatedDate) VALUES (?, ?, 'INVENTORY_DEDUCTED', ?)", [orderResult.lastInsertRowid, userId, timestamp]);
    }
    await tx.run("INSERT INTO OrderAuditLog (OrderId, UserId, Action, CreatedDate) VALUES (?, ?, 'ORDER_CREATED', ?)", [orderResult.lastInsertRowid, userId, timestamp]);
    await tx.run("INSERT INTO OrderStatusHistory (OrderId, OldStatus, NewStatus, ChangedBy, ChangedAt) VALUES (?, NULL, 'PENDING', ?, ?)", [orderResult.lastInsertRowid, userId, timestamp]);
    await tx.run("DELETE FROM CartItems WHERE CartId = (SELECT CartId FROM Carts WHERE UserId = ?)", [userId]);
    await tx.run("UPDATE Carts SET UpdatedDate = ? WHERE UserId = ?", [timestamp, userId]);
    return orderResult.lastInsertRowid;
  });
  return await getOrder(userId, orderId);
}

export async function updateOrderStatus(orderId, newStatus, adminUserId) {
  if (!ORDER_STATUSES.includes(newStatus)) throw Object.assign(new Error("Invalid order status."), { status: 400 });
  const timestamp = nowIso();
  const statusChanged = await transaction(async (tx) => {
    const existing = await tx.get("SELECT * FROM Orders WHERE OrderId = ?", [orderId]);
    if (!existing) return null;
    if (existing.OrderStatus === newStatus) return false;
    await tx.run("UPDATE Orders SET OrderStatus = ?, UpdatedDate = ? WHERE OrderId = ?", [newStatus, timestamp, orderId]);
    await tx.run("INSERT INTO OrderStatusHistory (OrderId, OldStatus, NewStatus, ChangedBy, ChangedAt) VALUES (?, ?, ?, ?, ?)", [orderId, existing.OrderStatus, newStatus, adminUserId, timestamp]);
    await tx.run("INSERT INTO OrderAuditLog (OrderId, UserId, Action, CreatedDate) VALUES (?, ?, ?, ?)", [orderId, adminUserId, newStatus === "CANCELLED" ? "ORDER_CANCELLED" : "ORDER_UPDATED", timestamp]);
    return true;
  });
  if (statusChanged === null) return null;
  return { ...(await getAdminOrder(orderId)), statusChanged };
}

export async function cancelOrder(userId, orderId, reason = "Customer requested cancellation") {
  const timestamp = nowIso();
  const cancelled = await transaction(async (tx) => {
    const existing = await tx.get("SELECT * FROM Orders WHERE UserId = ? AND OrderId = ?", [userId, orderId]);
    if (!existing) return null;
    if (existing.OrderStatus === "CANCELLED") throw Object.assign(new Error("Order is already cancelled."), { status: 409 });
    if (!cancellableStatuses.includes(existing.OrderStatus)) throw Object.assign(new Error("This order can no longer be cancelled because it has already been shipped."), { status: 409 });
    const refundStatus = existing.PaymentMethod === "COD" ? "NOT_APPLICABLE" : "PENDING";
    await tx.run("UPDATE Orders SET OrderStatus = 'CANCELLED', CancelledAt = ?, CancellationReason = ?, RefundStatus = ?, UpdatedDate = ? WHERE OrderId = ?", [timestamp, reason, refundStatus, timestamp, orderId]);
    const orderItems = await tx.all("SELECT ProductId, Quantity FROM OrderItems WHERE OrderId = ?", [orderId]);
    for (const item of orderItems) {
      await tx.run("UPDATE Inventory SET CurrentStock = CurrentStock + ?, AvailableStock = AvailableStock + ?, Status = CASE WHEN CurrentStock + ? = 0 THEN 'OUT_OF_STOCK' WHEN CurrentStock + ? <= 5 THEN 'LOW_STOCK' ELSE 'IN_STOCK' END, UpdatedDate = ? WHERE ProductId = ?", [item.Quantity, item.Quantity, item.Quantity, item.Quantity, timestamp, item.ProductId]);
      await tx.run("UPDATE Products SET Quantity = Quantity + ?, UpdatedDate = ? WHERE ProductId = ?", [item.Quantity, timestamp, item.ProductId]);
    }
    await tx.run("INSERT INTO OrderStatusHistory (OrderId, OldStatus, NewStatus, ChangedBy, ChangedAt) VALUES (?, ?, 'CANCELLED', ?, ?)", [orderId, existing.OrderStatus, userId, timestamp]);
    await tx.run("INSERT INTO OrderAuditLog (OrderId, UserId, Action, CreatedDate) VALUES (?, ?, 'ORDER_CANCELLED', ?)", [orderId, userId, timestamp]);
    return true;
  });
  return cancelled ? await getOrder(userId, orderId) : null;
}
