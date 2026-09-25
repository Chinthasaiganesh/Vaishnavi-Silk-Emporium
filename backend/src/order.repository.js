import { db, transaction } from "./db.js";
import { nowIso } from "./utils.js";

export const ORDER_STATUSES = ["PENDING", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "REFUNDED"];
const cancellableStatuses = ["PENDING", "PROCESSING", "PACKED"];
const orderTransitions = {
  PENDING: ["PROCESSING"],
  PROCESSING: ["PACKED"],
  PACKED: ["SHIPPED"],
  SHIPPED: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
  REFUNDED: []
};
const statusEvents = {
  PROCESSING: ["PROCESSING", "Processing", "Your order is being prepared for packing."],
  PACKED: ["PACKED", "Order Packed", "Your order has been packed and is ready to ship."],
  SHIPPED: ["SHIPPED", "Order Shipped", "Your order is on its way."],
  OUT_FOR_DELIVERY: ["OUT_FOR_DELIVERY", "Out For Delivery", "Your order is out for delivery."],
  DELIVERED: ["DELIVERED", "Order Delivered", "Your order has been delivered successfully."]
};

export function getAllowedOrderTransitions(status) {
  return orderTransitions[status] || [];
}

async function addLifecycleEvent(tx, orderId, eventType, title, description, actorRole, changedBy, eventDate) {
  await tx.run("INSERT INTO OrderLifecycleEvents (OrderId, EventType, Title, Description, ActorRole, ChangedBy, EventDate) VALUES (?, ?, ?, ?, ?, ?, ?)", [orderId, eventType, title, description, actorRole, changedBy || null, eventDate]);
}

export async function listOrders(userId) {
  return await db.prepare("SELECT o.*, COUNT(oi.OrderItemId) AS ItemCount, (SELECT ImageUrl FROM OrderItems preview WHERE preview.OrderId = o.OrderId ORDER BY preview.OrderItemId LIMIT 1) AS OrderImageUrl FROM Orders o LEFT JOIN OrderItems oi ON oi.OrderId = o.OrderId WHERE o.UserId = ? GROUP BY o.OrderId ORDER BY datetime(o.CreatedDate) DESC").all(userId);
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
  return { ...order, items: await db.prepare("SELECT * FROM OrderItems WHERE OrderId = ? ORDER BY OrderItemId").all(orderId), history: await getOrderStatusHistory(orderId), lifecycle: await getOrderLifecycle(orderId) };
}

export async function getAdminOrder(orderId) {
  const order = await db.prepare("SELECT o.*, u.Username, u.FullName AS CustomerName, u.Email, u.MobileNumber AS CustomerMobile, a.FullName, a.MobileNumber, a.AddressLine1, a.AddressLine2, a.City, a.State, a.PostalCode, a.Country FROM Orders o JOIN Users u ON u.UserId = o.UserId JOIN Addresses a ON a.AddressId = o.AddressId WHERE o.OrderId = ?").get(orderId);
  if (!order) return null;
  return { ...order, items: await db.prepare("SELECT * FROM OrderItems WHERE OrderId = ? ORDER BY OrderItemId").all(orderId), history: await getOrderStatusHistory(orderId), lifecycle: await getOrderLifecycle(orderId) };
}

export async function getOrderStatusHistory(orderId) {
  return await db.prepare("SELECT h.*, u.Username FROM OrderStatusHistory h LEFT JOIN Users u ON u.UserId = h.ChangedBy WHERE h.OrderId = ? ORDER BY datetime(h.ChangedAt), h.StatusHistoryId").all(orderId);
}

export async function getOrderLifecycle(orderId) {
  return await db.prepare("SELECT * FROM OrderLifecycleEvents WHERE OrderId = ? ORDER BY datetime(EventDate), LifecycleEventId").all(orderId);
}

export async function getOrderByIdempotencyKey(userId, idempotencyKey) {
  if (!idempotencyKey) return null;
  const existing = await db.prepare("SELECT OrderId FROM Orders WHERE UserId = ? AND IdempotencyKey = ?").get(userId, idempotencyKey);
  return existing ? await getOrder(userId, existing.OrderId) : null;
}

export async function createOrder({ userId, addressId, items, subtotal, shipping, discount, grandTotal, idempotencyKey, requestId, paymentMethod = 'UPI_MANUAL', paymentReference = null, paymentScreenshotUrl = null }) {
  console.info(JSON.stringify({ level: "info", message: "Order repository entry", requestId, userId, addressId, itemCount: items.length, subtotal, grandTotal, paymentMethod, paymentReferencePresent: Boolean(paymentReference) }));
  const timestamp = nowIso();
  const orderId = await transaction(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.get("SELECT OrderId FROM Orders WHERE UserId = ? AND IdempotencyKey = ?", [userId, idempotencyKey]);
      if (existing) return existing.OrderId;
    }
    const next = await tx.get("SELECT COALESCE(MAX(OrderId), 0) + 1 AS nextId FROM Orders");
    const orderNumber = `VSE-${new Date().getFullYear()}-${String(next.nextId).padStart(6, "0")}`;
    const orderResult = await tx.run('INSERT INTO "Orders" ("UserId", "AddressId", "OrderNumber", "IdempotencyKey", "PaymentMethod", "PaymentReference", "PaymentScreenshotUrl", "PaymentStatus", "PaymentSubmittedAt", "OrderStatus", "SubTotal", "ShippingAmount", "DiscountAmount", "GrandTotal", "CreatedDate", "UpdatedDate") VALUES (?, ?, ?, ?, ?, ?, ?, \'PENDING\', ?, \'PENDING\', ?, ?, ?, ?, ?, ?)', [userId, addressId, orderNumber, idempotencyKey || null, paymentMethod, paymentReference, paymentScreenshotUrl, paymentReference ? timestamp : null, subtotal, shipping, discount, grandTotal, timestamp, timestamp]);
    console.info(JSON.stringify({ level: "info", message: "Orders insert result", requestId, orderId: orderResult.lastInsertRowid, changes: orderResult.changes }));
    console.info(JSON.stringify({ level: "info", message: "Order database row created", requestId, orderId: orderResult.lastInsertRowid, orderNumber, subtotal, grandTotal }));
    for (const item of items) {
      await tx.run("INSERT INTO OrderItems (OrderId, ProductId, ProductName, ProductPrice, OriginalPrice, DiscountedPrice, DiscountPercentage, SavingsAmount, ImageUrl, Quantity, LineTotal, CreatedDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [orderResult.lastInsertRowid, item.ProductId, item.ProductName, item.Price, item.OriginalPrice ?? item.Price, item.DiscountedPrice ?? item.Price, item.DiscountPercentage ?? 0, item.SavingsAmount ?? 0, item.ImageUrl || null, item.Quantity, item.Price * item.Quantity, timestamp]);
      const result = await tx.run("UPDATE Inventory SET CurrentStock = CurrentStock - ?, AvailableStock = AvailableStock - ?, Status = CASE WHEN CurrentStock - ? = 0 THEN 'OUT_OF_STOCK' WHEN CurrentStock - ? <= 5 THEN 'LOW_STOCK' ELSE 'IN_STOCK' END, UpdatedDate = ? WHERE ProductId = ? AND AvailableStock >= ?", [item.Quantity, item.Quantity, item.Quantity, item.Quantity, timestamp, item.ProductId, item.Quantity]);
      console.info(JSON.stringify({ level: "info", message: "Inventory update result", requestId, productId: item.ProductId, requestedQuantity: item.Quantity, changes: result.changes }));
      if (result.changes !== 1) throw Object.assign(new Error(`Insufficient stock available for ${item.ProductName}.`), { status: 409, code: "INSUFFICIENT_STOCK" });
      await tx.run("UPDATE Products SET Quantity = Quantity - ?, UpdatedDate = ? WHERE ProductId = ?", [item.Quantity, timestamp, item.ProductId]);
      await tx.run("INSERT INTO OrderAuditLog (OrderId, UserId, Action, CreatedDate) VALUES (?, ?, 'INVENTORY_DEDUCTED', ?)", [orderResult.lastInsertRowid, userId, timestamp]);
    }
    await tx.run("INSERT INTO OrderAuditLog (OrderId, UserId, Action, CreatedDate) VALUES (?, ?, 'ORDER_CREATED', ?)", [orderResult.lastInsertRowid, userId, timestamp]);
    await tx.run("INSERT INTO OrderStatusHistory (OrderId, OldStatus, NewStatus, ChangedBy, ChangedAt) VALUES (?, NULL, 'PENDING', ?, ?)", [orderResult.lastInsertRowid, userId, timestamp]);
    await addLifecycleEvent(tx, orderResult.lastInsertRowid, "ORDER_PLACED", "Order Placed", "Your order was created successfully.", "CUSTOMER", userId, timestamp);
    if (paymentReference) await addLifecycleEvent(tx, orderResult.lastInsertRowid, "PAYMENT_SUBMITTED", "Payment Submitted", "Your payment details were submitted for verification.", "CUSTOMER", userId, timestamp);
    await tx.run("DELETE FROM CartItems WHERE CartId = (SELECT CartId FROM Carts WHERE UserId = ?)", [userId]);
    await tx.run("UPDATE Carts SET UpdatedDate = ? WHERE UserId = ?", [timestamp, userId]);
    return orderResult.lastInsertRowid;
  });
  return await getOrder(userId, orderId);
}

export async function createPaymentConflictOrder({ userId, addressId, items, subtotal, shipping, discount, grandTotal, idempotencyKey, paymentMethod = 'UPI_MANUAL', paymentReference, paymentScreenshotUrl, reason }) {
  const timestamp = nowIso();
  const orderId = await transaction(async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.get("SELECT OrderId FROM Orders WHERE UserId = ? AND IdempotencyKey = ?", [userId, idempotencyKey]);
      if (existing) return existing.OrderId;
    }
    const next = await tx.get("SELECT COALESCE(MAX(OrderId), 0) + 1 AS nextId FROM Orders");
    const orderNumber = `VSE-${new Date().getFullYear()}-${String(next.nextId).padStart(6, "0")}`;
    const orderResult = await tx.run('INSERT INTO "Orders" ("UserId", "AddressId", "OrderNumber", "IdempotencyKey", "PaymentMethod", "PaymentReference", "PaymentScreenshotUrl", "PaymentStatus", "PaymentSubmittedAt", "OrderStatus", "RefundStatus", "RefundInitiatedAt", "CancellationReason", "CancelledByRole", "SubTotal", "ShippingAmount", "DiscountAmount", "GrandTotal", "CreatedDate", "UpdatedDate") VALUES (?, ?, ?, ?, ?, ?, ?, \'PENDING\', ?, \'CANCELLED\', \'PENDING\', ?, ?, \'ADMIN\', ?, ?, ?, ?, ?, ?)', [userId, addressId, orderNumber, idempotencyKey || null, paymentMethod, paymentReference, paymentScreenshotUrl, timestamp, timestamp, reason, subtotal, shipping, discount, grandTotal, timestamp, timestamp]);
    for (const item of items) {
      await tx.run("INSERT INTO OrderItems (OrderId, ProductId, ProductName, ProductPrice, OriginalPrice, DiscountedPrice, DiscountPercentage, SavingsAmount, ImageUrl, Quantity, LineTotal, CreatedDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [orderResult.lastInsertRowid, item.ProductId, item.ProductName, item.Price, item.OriginalPrice ?? item.Price, item.DiscountedPrice ?? item.Price, item.DiscountPercentage ?? 0, item.SavingsAmount ?? 0, item.ImageUrl || null, item.Quantity, item.Price * item.Quantity, timestamp]);
    }
    await tx.run("INSERT INTO OrderAuditLog (OrderId, UserId, Action, CreatedDate) VALUES (?, ?, 'ORDER_CREATED', ?)", [orderResult.lastInsertRowid, userId, timestamp]);
    await tx.run("INSERT INTO OrderStatusHistory (OrderId, OldStatus, NewStatus, ChangedBy, ChangedAt) VALUES (?, NULL, 'CANCELLED', ?, ?)", [orderResult.lastInsertRowid, userId, timestamp]);
    await addLifecycleEvent(tx, orderResult.lastInsertRowid, "ORDER_PLACED", "Payment received, stock unavailable", "Your payment proof was saved. This order was cancelled because another customer purchased the last available item. Verify the payment so a refund can be processed.", "SYSTEM", userId, timestamp);
    await addLifecycleEvent(tx, orderResult.lastInsertRowid, "PAYMENT_SUBMITTED", "Payment Submitted", "Your payment details were submitted for verification.", "CUSTOMER", userId, timestamp);
    await addLifecycleEvent(tx, orderResult.lastInsertRowid, "REFUND_INITIATED", "Refund Initiated", "A refund will be processed after payment verification.", "SYSTEM", userId, timestamp);
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
    if (!(orderTransitions[existing.OrderStatus] || []).includes(newStatus)) {
      throw Object.assign(new Error(`Order cannot move from ${existing.OrderStatus} to ${newStatus}.`), { status: 409 });
    }
    if (existing.PaymentMethod === "UPI_MANUAL" && existing.PaymentStatus !== "VERIFIED") {
      throw Object.assign(new Error("Verify payment before advancing fulfillment."), { status: 409 });
    }
    await tx.run("UPDATE Orders SET OrderStatus = ?, UpdatedDate = ? WHERE OrderId = ?", [newStatus, timestamp, orderId]);
    await tx.run("INSERT INTO OrderStatusHistory (OrderId, OldStatus, NewStatus, ChangedBy, ChangedAt) VALUES (?, ?, ?, ?, ?)", [orderId, existing.OrderStatus, newStatus, adminUserId, timestamp]);
    await tx.run("INSERT INTO OrderAuditLog (OrderId, UserId, Action, CreatedDate) VALUES (?, ?, 'ORDER_UPDATED', ?)", [orderId, adminUserId, timestamp]);
    const [eventType, title, description] = statusEvents[newStatus];
    await addLifecycleEvent(tx, orderId, eventType, title, description, "ADMIN", adminUserId, timestamp);
    return true;
  });
  if (statusChanged === null) return null;
  return { ...(await getAdminOrder(orderId)), statusChanged };
}

export async function updatePaymentStatus(orderId, paymentStatus, rejectionReason, adminUserId) {
  if (!["VERIFIED", "REJECTED"].includes(paymentStatus)) throw Object.assign(new Error("Invalid payment status."), { status: 400 });
  if (paymentStatus === "REJECTED" && !rejectionReason?.trim()) throw Object.assign(new Error("A rejection reason is required."), { status: 400 });
  const timestamp = nowIso();
  const updated = await transaction(async (tx) => {
    const existing = await tx.get("SELECT PaymentStatus, OrderStatus, RefundStatus FROM Orders WHERE OrderId = ?", [orderId]);
    if (!existing || existing.PaymentStatus !== "PENDING") return false;
    const nextOrderStatus = paymentStatus === "VERIFIED" && existing.OrderStatus === "PENDING" ? "PROCESSING" : existing.OrderStatus;
    const refundStartsAfterCancellation = paymentStatus === "VERIFIED" && existing.OrderStatus === "CANCELLED" && existing.RefundStatus === "NOT_APPLICABLE";
    const nextRefundStatus = refundStartsAfterCancellation ? "PENDING" : existing.RefundStatus;
    await tx.run("UPDATE Orders SET PaymentStatus = ?, PaymentReviewedAt = ?, PaymentRejectionReason = ?, OrderStatus = ?, RefundStatus = ?, RefundInitiatedAt = CASE WHEN ? = 1 THEN ? ELSE RefundInitiatedAt END, UpdatedDate = ? WHERE OrderId = ?", [paymentStatus, timestamp, paymentStatus === "REJECTED" ? rejectionReason.trim() : null, nextOrderStatus, nextRefundStatus, refundStartsAfterCancellation ? 1 : 0, timestamp, timestamp, orderId]);
    if (paymentStatus === "VERIFIED") {
      await addLifecycleEvent(tx, orderId, "PAYMENT_VERIFIED", "Payment Verified", "Your payment was verified successfully.", "ADMIN", adminUserId, timestamp);
      if (existing.OrderStatus !== "CANCELLED") {
        await addLifecycleEvent(tx, orderId, "ORDER_CONFIRMED", "Order Confirmed", "Your order is confirmed and ready for processing.", "SYSTEM", adminUserId, timestamp);
        if (nextOrderStatus === "PROCESSING") await addLifecycleEvent(tx, orderId, "PROCESSING", "Processing", "Your order is being prepared for packing.", "SYSTEM", adminUserId, timestamp);
      }
      if (refundStartsAfterCancellation) await addLifecycleEvent(tx, orderId, "REFUND_INITIATED", "Refund Initiated", "Payment was verified after cancellation. Your refund is ready for processing.", "SYSTEM", adminUserId, timestamp);
    } else {
      await addLifecycleEvent(tx, orderId, "PAYMENT_REJECTED", "Payment Verification Failed", `Reason: ${rejectionReason.trim()}`, "ADMIN", adminUserId, timestamp);
    }
    if (nextOrderStatus !== existing.OrderStatus) {
      await tx.run("INSERT INTO OrderStatusHistory (OrderId, OldStatus, NewStatus, ChangedBy, ChangedAt) VALUES (?, ?, ?, ?, ?)", [orderId, existing.OrderStatus, nextOrderStatus, adminUserId, timestamp]);
    }
    await tx.run("INSERT INTO OrderAuditLog (OrderId, UserId, Action, CreatedDate) VALUES (?, ?, 'ORDER_UPDATED', ?)", [orderId, adminUserId, timestamp]);
    return true;
  });
  return updated ? getAdminOrder(orderId) : null;
}

export async function resubmitPaymentProof(userId, orderId, paymentReference, paymentScreenshotUrl) {
  const timestamp = nowIso();
  const updated = await transaction(async (tx) => {
    const result = await tx.run("UPDATE Orders SET PaymentReference = ?, PaymentScreenshotUrl = ?, PaymentStatus = 'PENDING', PaymentSubmittedAt = ?, PaymentReviewedAt = NULL, PaymentRejectionReason = NULL, UpdatedDate = ? WHERE OrderId = ? AND UserId = ? AND PaymentMethod = 'UPI_MANUAL' AND PaymentStatus = 'REJECTED'", [paymentReference, paymentScreenshotUrl, timestamp, timestamp, orderId, userId]);
    if (!result.changes) return false;
    await tx.run("INSERT INTO OrderAuditLog (OrderId, UserId, Action, CreatedDate) VALUES (?, ?, 'ORDER_UPDATED', ?)", [orderId, userId, timestamp]);
    await addLifecycleEvent(tx, orderId, "PAYMENT_SUBMITTED", "Payment Re-submitted", "Updated payment details were submitted for verification.", "CUSTOMER", userId, timestamp);
    return true;
  });
  return updated ? getOrder(userId, orderId) : null;
}

export async function updateRefundStatus(orderId, refundStatus, refundReference, adminUserId) {
  if (!["PROCESSING", "COMPLETED", "FAILED"].includes(refundStatus)) throw Object.assign(new Error("Invalid refund status."), { status: 400 });
  const timestamp = nowIso();
  const updated = await transaction(async (tx) => {
    const existing = await tx.get("SELECT RefundStatus, OrderStatus, PaymentStatus FROM Orders WHERE OrderId = ?", [orderId]);
    if (!existing || existing.PaymentStatus !== "VERIFIED") return false;
    const allowed = existing.RefundStatus === "PENDING" ? ["PROCESSING", "FAILED"] : existing.RefundStatus === "PROCESSING" ? ["COMPLETED", "FAILED"] : existing.RefundStatus === "FAILED" ? ["PROCESSING"] : [];
    if (!allowed.includes(refundStatus)) throw Object.assign(new Error(`Refund cannot move from ${existing.RefundStatus} to ${refundStatus}.`), { status: 409 });
    const orderStatus = refundStatus === "COMPLETED" ? "REFUNDED" : existing.OrderStatus;
    await tx.run("UPDATE Orders SET RefundStatus = ?, RefundReference = COALESCE(?, RefundReference), RefundProcessingAt = CASE WHEN ? = 'PROCESSING' THEN ? ELSE RefundProcessingAt END, RefundCompletedAt = CASE WHEN ? = 'COMPLETED' THEN ? ELSE RefundCompletedAt END, OrderStatus = ?, UpdatedDate = ? WHERE OrderId = ?", [refundStatus, refundReference || null, refundStatus, timestamp, refundStatus, timestamp, orderStatus, timestamp, orderId]);
    if (orderStatus !== existing.OrderStatus) await tx.run("INSERT INTO OrderStatusHistory (OrderId, OldStatus, NewStatus, ChangedBy, ChangedAt) VALUES (?, ?, 'REFUNDED', ?, ?)", [orderId, existing.OrderStatus, adminUserId, timestamp]);
    await tx.run("INSERT INTO OrderAuditLog (OrderId, UserId, Action, CreatedDate) VALUES (?, ?, 'ORDER_UPDATED', ?)", [orderId, adminUserId, timestamp]);
    const event = refundStatus === "PROCESSING" ? ["REFUND_IN_PROGRESS", "Refund Processing", "Your refund is being processed."] : refundStatus === "COMPLETED" ? ["REFUNDED", "Refund Completed", "Your refund has been successfully processed."] : ["REFUND_FAILED", "Refund Processing Issue", "Your refund needs additional review."];
    await addLifecycleEvent(tx, orderId, ...event, "ADMIN", adminUserId, timestamp);
    return true;
  });
  return updated ? getAdminOrder(orderId) : null;
}

export async function cancelOrder(userId, orderId, reason = "Customer requested cancellation", actorRole = "CUSTOMER") {
  const timestamp = nowIso();
  const cancelled = await transaction(async (tx) => {
    const existing = actorRole === "ADMIN" ? await tx.get("SELECT * FROM Orders WHERE OrderId = ?", [orderId]) : await tx.get("SELECT * FROM Orders WHERE UserId = ? AND OrderId = ?", [userId, orderId]);
    if (!existing) return null;
    if (existing.OrderStatus === "CANCELLED") throw Object.assign(new Error("Order is already cancelled."), { status: 409 });
    if (!cancellableStatuses.includes(existing.OrderStatus)) throw Object.assign(new Error("This order can no longer be cancelled because it has already been shipped."), { status: 409 });
    const paymentWasSubmitted = existing.PaymentMethod !== "COD" && Boolean(existing.PaymentReference || existing.PaymentScreenshotUrl || existing.PaymentSubmittedAt);
    const refundStatus = paymentWasSubmitted ? "PENDING" : "NOT_APPLICABLE";
    await tx.run("UPDATE Orders SET OrderStatus = 'CANCELLED', CancelledAt = ?, CancellationReason = ?, CancelledByRole = ?, RefundStatus = ?, RefundInitiatedAt = ?, UpdatedDate = ? WHERE OrderId = ?", [timestamp, reason, actorRole, refundStatus, refundStatus === "PENDING" ? timestamp : null, timestamp, orderId]);
    const orderItems = await tx.all("SELECT ProductId, Quantity FROM OrderItems WHERE OrderId = ?", [orderId]);
    for (const item of orderItems) {
      await tx.run("UPDATE Inventory SET CurrentStock = CurrentStock + ?, AvailableStock = AvailableStock + ?, Status = CASE WHEN CurrentStock + ? = 0 THEN 'OUT_OF_STOCK' WHEN CurrentStock + ? <= 5 THEN 'LOW_STOCK' ELSE 'IN_STOCK' END, UpdatedDate = ? WHERE ProductId = ?", [item.Quantity, item.Quantity, item.Quantity, item.Quantity, timestamp, item.ProductId]);
      await tx.run("UPDATE Products SET Quantity = Quantity + ?, UpdatedDate = ? WHERE ProductId = ?", [item.Quantity, timestamp, item.ProductId]);
    }
    await tx.run("INSERT INTO OrderStatusHistory (OrderId, OldStatus, NewStatus, ChangedBy, ChangedAt) VALUES (?, ?, 'CANCELLED', ?, ?)", [orderId, existing.OrderStatus, userId, timestamp]);
    await tx.run("INSERT INTO OrderAuditLog (OrderId, UserId, Action, CreatedDate) VALUES (?, ?, 'ORDER_CANCELLED', ?)", [orderId, userId, timestamp]);
    await addLifecycleEvent(tx, orderId, "CANCELLED", "Order Cancelled", reason, actorRole, userId, timestamp);
    if (refundStatus === "PENDING") {
      const description = existing.PaymentStatus === "VERIFIED" ? "Your refund request has been accepted." : "Refund tracking has started. Processing will begin after payment verification.";
      await addLifecycleEvent(tx, orderId, "REFUND_INITIATED", "Refund Initiated", description, "SYSTEM", userId, timestamp);
    }
    return true;
  });
  if (!cancelled) return null;
  return actorRole === "ADMIN" ? await getAdminOrder(orderId) : await getOrder(userId, orderId);
}
