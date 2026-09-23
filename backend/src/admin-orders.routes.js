import { Router } from "express";
import { body, param, query } from "express-validator";
import { adminOnly, authRequired, validateRequest } from "./middleware.js";
import { ORDER_STATUSES, cancelOrder, getAdminOrder, getAllowedOrderTransitions, listAllOrders, updateOrderStatus, updatePaymentStatus, updateRefundStatus } from "./order.repository.js";
import { sendOrderNotification } from "./notification.service.js";

const router = Router();

async function notifyOrderStatus(order) {
  const notifications = {
    PROCESSING: ["Order Processing", "Your order is being prepared for packing."],
    PACKED: ["Order Packed", "Your order has been packed and is ready to ship."],
    SHIPPED: ["Order Shipped", "Your order is on its way."],
    OUT_FOR_DELIVERY: ["Out For Delivery", "Your order is out for delivery."],
    DELIVERED: ["Order Delivered", "Your order has been delivered successfully."]
  };
  const [title, message] = notifications[order.OrderStatus] || ["Order Updated", `Order ${order.OrderNumber} has been updated.`];
  await sendOrderNotification(order, title, message);
}

router.get(
  "/",
  authRequired,
  adminOnly,
  query("q").optional().trim(),
  query("status").optional().trim(),
  validateRequest,
  async (req, res) => {
    const status = req.query.status || "";
    if (status && !ORDER_STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Invalid order status." });
    return res.json({ orders: await listAllOrders({ q: req.query.q || "", status }), statuses: ORDER_STATUSES });
  }
);

router.get("/:id", authRequired, adminOnly, param("id").isInt({ min: 1 }), validateRequest, async (req, res) => {
  const order = await getAdminOrder(Number(req.params.id));
  return order ? res.json({ order, statuses: ORDER_STATUSES, allowedTransitions: getAllowedOrderTransitions(order.OrderStatus) }) : res.status(404).json({ success: false, message: "Order not found." });
});

router.patch(
  "/:id/status",
  authRequired,
  adminOnly,
  param("id").isInt({ min: 1 }),
  body("status").isIn(ORDER_STATUSES).withMessage("Invalid order status."),
  validateRequest,
  async (req, res, next) => {
    try {
      const order = await updateOrderStatus(Number(req.params.id), req.body.status, req.user.userId);
      if (!order) return res.status(404).json({ success: false, message: "Order not found." });
      if (order.statusChanged) await notifyOrderStatus(order);
      return res.json({ success: true, message: "Order status updated.", order, allowedTransitions: getAllowedOrderTransitions(order.OrderStatus) });
    } catch (error) {
      return next(error);
    }
  }
);

router.patch("/:id/payment", authRequired, adminOnly, param("id").isInt({ min: 1 }), body("paymentStatus").isIn(["VERIFIED", "REJECTED"]), body("rejectionReason").custom((value, { req }) => {
  if (req.body.paymentStatus !== "REJECTED") return true;
  if (typeof value !== "string" || value.trim().length < 3 || value.trim().length > 500) throw new Error("Rejection reason must be between 3 and 500 characters.");
  return true;
}), validateRequest, async (req, res, next) => {
  try {
    const order = await updatePaymentStatus(Number(req.params.id), req.body.paymentStatus, req.body.rejectionReason, req.user.userId);
    if (order) {
      if (req.body.paymentStatus === "VERIFIED") {
        await sendOrderNotification(order, "Payment Verified", `Your payment has been successfully verified. Order ${order.OrderNumber} is now confirmed and being processed.`, "PAYMENT_STATUS");
        await sendOrderNotification(order, "Order Confirmed", `Order ${order.OrderNumber} is confirmed and being processed.`);
        await sendOrderNotification(order, "Order Processing", "Your order is being prepared for packing.");
      } else {
        await sendOrderNotification(order, "Payment Verification Failed", `Order #${order.OrderNumber} requires your attention. Reason: ${order.PaymentRejectionReason}. Please re-submit payment details or contact support.`, "PAYMENT_STATUS");
      }
    }
    return order ? res.json({ success: true, message: "Payment status updated.", order }) : res.status(409).json({ success: false, message: "Payment has already been reviewed or the order was not found." });
  } catch (error) { return next(error); }
});

router.post("/:id/cancel", authRequired, adminOnly, param("id").isInt({ min: 1 }), body("reason").trim().isLength({ min: 3, max: 300 }).withMessage("Cancellation reason must be between 3 and 300 characters."), validateRequest, async (req, res, next) => {
  try {
    const order = await cancelOrder(req.user.userId, Number(req.params.id), req.body.reason.trim(), "ADMIN");
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    await sendOrderNotification(order, "Order Cancelled", `Order ${order.OrderNumber} was cancelled by the store. Reason: ${order.CancellationReason}.`);
    if (order.RefundStatus === "PENDING") await sendOrderNotification(order, "Refund Initiated", "Your refund request has been accepted.", "REFUND_STATUS");
    return res.json({ success: true, message: "Order cancelled.", order, allowedTransitions: [] });
  } catch (error) { return next(error); }
});

router.patch("/:id/refund", authRequired, adminOnly, param("id").isInt({ min: 1 }), body("refundStatus").isIn(["PROCESSING", "COMPLETED", "FAILED"]), body("refundReference").optional().trim().isLength({ max: 120 }), validateRequest, async (req, res, next) => {
  try {
    const order = await updateRefundStatus(Number(req.params.id), req.body.refundStatus, req.body.refundReference, req.user.userId);
    if (!order) return res.status(409).json({ success: false, message: "Refund cannot be updated until payment is verified and the refund is pending or processing." });
    const title = req.body.refundStatus === "COMPLETED" ? "Refund Completed" : req.body.refundStatus === "FAILED" ? "Refund Processing Issue" : "Refund Processing";
    const message = req.body.refundStatus === "COMPLETED" ? `Refund for order ${order.OrderNumber} has been successfully processed.` : req.body.refundStatus === "FAILED" ? `Refund for order ${order.OrderNumber} could not be processed. Our team will review it.` : `Refund initiated for order ${order.OrderNumber}.`;
    await sendOrderNotification(order, title, message, "REFUND_STATUS");
    return res.json({ success: true, message: "Refund status updated.", order, allowedTransitions: getAllowedOrderTransitions(order.OrderStatus) });
  } catch (error) { return next(error); }
});

export default router;
