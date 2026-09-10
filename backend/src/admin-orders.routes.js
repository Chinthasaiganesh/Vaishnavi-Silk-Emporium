import { Router } from "express";
import { body, param, query } from "express-validator";
import { adminOnly, authRequired, validateRequest } from "./middleware.js";
import { ORDER_STATUSES, getAdminOrder, listAllOrders, updateOrderStatus, updatePaymentStatus, updateRefundStatus } from "./order.repository.js";
import { sendOrderNotification } from "./notification.service.js";

const router = Router();

async function notifyOrderStatus(order) {
  const readable = order.OrderStatus.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
  await sendOrderNotification(order, `Order ${readable}`, `Your order ${order.OrderNumber} is now ${readable}.`);
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
  return order ? res.json({ order, statuses: ORDER_STATUSES }) : res.status(404).json({ success: false, message: "Order not found." });
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
      return res.json({ success: true, message: "Order status updated.", order });
    } catch (error) {
      return next(error);
    }
  }
);

router.patch("/:id/payment", authRequired, adminOnly, param("id").isInt({ min: 1 }), body("paymentStatus").isIn(["VERIFIED", "REJECTED"]), validateRequest, async (req, res, next) => {
  try {
    const order = await updatePaymentStatus(Number(req.params.id), req.body.paymentStatus, req.user.userId);
    if (order && req.body.paymentStatus === "VERIFIED") {
      await sendOrderNotification(order, "Payment Confirmed", `Payment for your order ${order.OrderNumber} has been confirmed. Your order is being processed.`);
    }
    return order ? res.json({ success: true, message: "Payment status updated.", order }) : res.status(409).json({ success: false, message: "Payment has already been reviewed or the order was not found." });
  } catch (error) { return next(error); }
});

router.patch("/:id/refund", authRequired, adminOnly, param("id").isInt({ min: 1 }), body("refundStatus").isIn(["PROCESSING", "COMPLETED", "FAILED"]), body("refundReference").optional().trim().isLength({ max: 120 }), validateRequest, async (req, res, next) => {
  try {
    const order = await updateRefundStatus(Number(req.params.id), req.body.refundStatus, req.body.refundReference, req.user.userId);
    if (!order) return res.status(409).json({ success: false, message: "Refund cannot be updated until payment is verified and the refund is pending or processing." });
    const title = req.body.refundStatus === "COMPLETED" ? "Refund Completed" : req.body.refundStatus === "FAILED" ? "Refund Failed" : "Refund Processing";
    const message = req.body.refundStatus === "COMPLETED" ? `Refund for order ${order.OrderNumber} has been successfully processed.` : req.body.refundStatus === "FAILED" ? `Refund for order ${order.OrderNumber} could not be processed. Our team will review it.` : `Refund initiated for order ${order.OrderNumber}.`;
    await sendOrderNotification(order, title, message);
    return res.json({ success: true, message: "Refund status updated.", order });
  } catch (error) { return next(error); }
});

export default router;
