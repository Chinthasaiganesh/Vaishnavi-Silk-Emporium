import { db } from "./db.js";
import { nowIso } from "./utils.js";

export const ORDER_STATUSES = ["PENDING", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "REFUNDED"];
const cancellableStatuses = ["PENDING", "PROCESSING", "PACKED"];

export function listOrders(userId) {
  return db.prepare("SELECT o.*, COUNT(oi.OrderItemId) AS ItemCount FROM Orders o LEFT JOIN OrderItems oi ON oi.OrderId = o.OrderId WHERE o.UserId = ? GROUP BY o.OrderId ORDER BY datetime(o.CreatedDate) DESC").all(userId);
}

export function listAllOrders({ q = "", status = "" } = {}) {
  const orders = db.prepare(`
    SELECT o.*, u.Username, u.FullName, u.Email, u.MobileNumber, COUNT(oi.OrderItemId) AS ItemCount
    FROM Orders o JOIN Users u ON u.UserId = o.UserId
    LEFT JOIN OrderItems oi ON oi.OrderId = o.OrderId
    GROUP BY o.OrderId
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

export function getOrder(userId, orderId) {
  const order = db.prepare("SELECT o.*, a.FullName, a.MobileNumber, a.AddressLine1, a.AddressLine2, a.City, a.State, a.PostalCode, a.Country FROM Orders o JOIN Addresses a ON a.AddressId = o.AddressId WHERE o.UserId = ? AND o.OrderId = ?").get(userId, orderId);
  if (!order) return null;
  return { ...order, items: db.prepare("SELECT * FROM OrderItems WHERE OrderId = ? ORDER BY OrderItemId").all(orderId), history: getOrderStatusHistory(orderId) };
}

export function getAdminOrder(orderId) {
  const order = db.prepare("SELECT o.*, u.Username, u.FullName AS CustomerName, u.Email, u.MobileNumber AS CustomerMobile, a.FullName, a.MobileNumber, a.AddressLine1, a.AddressLine2, a.City, a.State, a.PostalCode, a.Country FROM Orders o JOIN Users u ON u.UserId = o.UserId JOIN Addresses a ON a.AddressId = o.AddressId WHERE o.OrderId = ?").get(orderId);
  if (!order) return null;
  return { ...order, items: db.prepare("SELECT * FROM OrderItems WHERE OrderId = ? ORDER BY OrderItemId").all(orderId), history: getOrderStatusHistory(orderId) };
}

export function getOrderStatusHistory(orderId) {
  return db.prepare("SELECT h.*, u.Username FROM OrderStatusHistory h LEFT JOIN Users u ON u.UserId = h.ChangedBy WHERE h.OrderId = ? ORDER BY datetime(h.ChangedAt), h.StatusHistoryId").all(orderId);
}

export function getOrderByIdempotencyKey(userId, idempotencyKey) {
  if (!idempotencyKey) return null;
  const existing = db.prepare("SELECT OrderId FROM Orders WHERE UserId = ? AND IdempotencyKey = ?").get(userId, idempotencyKey);
  return existing ? getOrder(userId, existing.OrderId) : null;
}

export function createOrder({ userId, addressId, items, subtotal, shipping, discount, grandTotal, idempotencyKey, requestId }) {
  console.info(JSON.stringify({ level: "info", message: "Entered Order Repository", requestId, userId, addressId, itemCount: items.length }));
  const timestamp = nowIso();
  db.exec("BEGIN IMMEDIATE");
  try {
    if (idempotencyKey) {
      const existing = db.prepare("SELECT OrderId FROM Orders WHERE UserId = ? AND IdempotencyKey = ?").get(userId, idempotencyKey);
      if (existing) {
        db.exec("COMMIT");
        return getOrder(userId, existing.OrderId);
      }
    }
    const nextId = db.prepare("SELECT COALESCE(MAX(OrderId), 0) + 1 AS nextId FROM Orders").get().nextId;
    const orderNumber = `VSE-${new Date().getFullYear()}-${String(nextId).padStart(6, "0")}`;
    const orderResult = db.prepare("INSERT INTO Orders (UserId, AddressId, OrderNumber, IdempotencyKey, PaymentMethod, OrderStatus, SubTotal, ShippingAmount, DiscountAmount, GrandTotal, CreatedDate, UpdatedDate) VALUES (?, ?, ?, ?, 'COD', 'PENDING', ?, ?, ?, ?, ?, ?)").run(userId, addressId, orderNumber, idempotencyKey || null, subtotal, shipping, discount, grandTotal, timestamp, timestamp);
    const orderId = orderResult.lastInsertRowid;
    console.info(JSON.stringify({ level: "info", message: "Order database row created", requestId, orderId, orderNumber, subtotal, grandTotal }));
    const insertItem = db.prepare("INSERT INTO OrderItems (OrderId, ProductId, ProductName, ProductPrice, Quantity, LineTotal, CreatedDate) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const deductInventory = db.prepare("UPDATE Inventory SET CurrentStock = CurrentStock - ?, AvailableStock = AvailableStock - ?, Status = CASE WHEN CurrentStock - ? = 0 THEN 'OUT_OF_STOCK' WHEN CurrentStock - ? <= 5 THEN 'LOW_STOCK' ELSE 'IN_STOCK' END, UpdatedDate = ? WHERE ProductId = ? AND AvailableStock >= ?");
    for (const item of items) {
      insertItem.run(orderId, item.ProductId, item.ProductName, item.Price, item.Quantity, item.Price * item.Quantity, timestamp);
      const result = deductInventory.run(item.Quantity, item.Quantity, item.Quantity, item.Quantity, timestamp, item.ProductId, item.Quantity);
      if (result.changes !== 1) throw Object.assign(new Error("Insufficient inventory available."), { status: 409 });
      db.prepare("UPDATE Products SET Quantity = Quantity - ?, UpdatedDate = ? WHERE ProductId = ?").run(item.Quantity, timestamp, item.ProductId);
      db.prepare("INSERT INTO OrderAuditLog (OrderId, UserId, Action, CreatedDate) VALUES (?, ?, 'INVENTORY_DEDUCTED', ?)").run(orderId, userId, timestamp);
    }
    db.prepare("INSERT INTO OrderAuditLog (OrderId, UserId, Action, CreatedDate) VALUES (?, ?, 'ORDER_CREATED', ?)").run(orderId, userId, timestamp);
    db.prepare("INSERT INTO OrderStatusHistory (OrderId, OldStatus, NewStatus, ChangedBy, ChangedAt) VALUES (?, NULL, 'PENDING', ?, ?)").run(orderId, userId, timestamp);
    db.prepare("DELETE FROM CartItems WHERE CartId = (SELECT CartId FROM Carts WHERE UserId = ?)").run(userId);
    db.prepare("UPDATE Carts SET UpdatedDate = ? WHERE UserId = ?").run(timestamp, userId);
    db.exec("COMMIT");
    return getOrder(userId, orderId);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function updateOrderStatus(orderId, newStatus, adminUserId) {
  if (!ORDER_STATUSES.includes(newStatus)) throw Object.assign(new Error("Invalid order status."), { status: 400 });
  const timestamp = nowIso();
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db.prepare("SELECT * FROM Orders WHERE OrderId = ?").get(orderId);
    if (!existing) {
      db.exec("ROLLBACK");
      return null;
    }
    const statusChanged = existing.OrderStatus !== newStatus;
    if (statusChanged) {
      db.prepare("UPDATE Orders SET OrderStatus = ?, UpdatedDate = ? WHERE OrderId = ?").run(newStatus, timestamp, orderId);
      db.prepare("INSERT INTO OrderStatusHistory (OrderId, OldStatus, NewStatus, ChangedBy, ChangedAt) VALUES (?, ?, ?, ?, ?)").run(orderId, existing.OrderStatus, newStatus, adminUserId, timestamp);
      db.prepare("INSERT INTO OrderAuditLog (OrderId, UserId, Action, CreatedDate) VALUES (?, ?, ?, ?)").run(orderId, adminUserId, newStatus === "CANCELLED" ? "ORDER_CANCELLED" : "ORDER_UPDATED", timestamp);
    }
    db.exec("COMMIT");
    return { ...getAdminOrder(orderId), statusChanged };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function cancelOrder(userId, orderId, reason = "Customer requested cancellation") {
  const timestamp = nowIso();
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db.prepare("SELECT * FROM Orders WHERE UserId = ? AND OrderId = ?").get(userId, orderId);
    if (!existing) {
      db.exec("ROLLBACK");
      return null;
    }
    if (existing.OrderStatus === "CANCELLED") throw Object.assign(new Error("Order is already cancelled."), { status: 409 });
    if (!cancellableStatuses.includes(existing.OrderStatus)) throw Object.assign(new Error("This order can no longer be cancelled because it has already been shipped."), { status: 409 });
    const refundStatus = existing.PaymentMethod === "COD" ? "NOT_APPLICABLE" : "PENDING";
    db.prepare("UPDATE Orders SET OrderStatus = 'CANCELLED', CancelledAt = ?, CancellationReason = ?, RefundStatus = ?, UpdatedDate = ? WHERE OrderId = ?").run(timestamp, reason, refundStatus, timestamp, orderId);
    const items = db.prepare("SELECT ProductId, Quantity FROM OrderItems WHERE OrderId = ?").all(orderId);
    for (const item of items) {
      db.prepare("UPDATE Inventory SET CurrentStock = CurrentStock + ?, AvailableStock = AvailableStock + ?, Status = CASE WHEN CurrentStock + ? = 0 THEN 'OUT_OF_STOCK' WHEN CurrentStock + ? <= 5 THEN 'LOW_STOCK' ELSE 'IN_STOCK' END, UpdatedDate = ? WHERE ProductId = ?").run(item.Quantity, item.Quantity, item.Quantity, item.Quantity, timestamp, item.ProductId);
      db.prepare("UPDATE Products SET Quantity = Quantity + ?, UpdatedDate = ? WHERE ProductId = ?").run(item.Quantity, timestamp, item.ProductId);
    }
    db.prepare("INSERT INTO OrderStatusHistory (OrderId, OldStatus, NewStatus, ChangedBy, ChangedAt) VALUES (?, ?, 'CANCELLED', ?, ?)").run(orderId, existing.OrderStatus, userId, timestamp);
    db.prepare("INSERT INTO OrderAuditLog (OrderId, UserId, Action, CreatedDate) VALUES (?, ?, 'ORDER_CANCELLED', ?)").run(orderId, userId, timestamp);
    db.exec("COMMIT");
    return getOrder(userId, orderId);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
