import { Router } from "express";
import { body, param, query } from "express-validator";
import { db } from "./db.js";
import { adminOnly, authRequired, validateRequest } from "./middleware.js";
import { ORDER_STATUSES, getAdminOrder, listAllOrders, updateOrderStatus } from "./order.repository.js";
import { nowIso } from "./utils.js";

const router = Router();

function notifyOrderStatus(order) {
  const readable = order.OrderStatus.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
  db.prepare("INSERT INTO Notifications (UserId, ProductId, OrderId, Type, Title, Message, CreatedDate) VALUES (?, NULL, ?, 'ORDER_STATUS', ?, ?, ?)").run(
    order.UserId,
    order.OrderId,
    "Order Status Updated",
    `Your order ${order.OrderNumber} is now ${readable}.`,
    nowIso()
  );
}

router.get(
  "/",
  authRequired,
  adminOnly,
  query("q").optional().trim(),
  query("status").optional().trim(),
  validateRequest,
  (req, res) => {
    const status = req.query.status || "";
    if (status && !ORDER_STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Invalid order status." });
    return res.json({ orders: listAllOrders({ q: req.query.q || "", status }), statuses: ORDER_STATUSES });
  }
);

router.get("/:id", authRequired, adminOnly, param("id").isInt({ min: 1 }), validateRequest, (req, res) => {
  const order = getAdminOrder(Number(req.params.id));
  return order ? res.json({ order, statuses: ORDER_STATUSES }) : res.status(404).json({ success: false, message: "Order not found." });
});

router.patch(
  "/:id/status",
  authRequired,
  adminOnly,
  param("id").isInt({ min: 1 }),
  body("status").isIn(ORDER_STATUSES).withMessage("Invalid order status."),
  validateRequest,
  (req, res, next) => {
    try {
      const order = updateOrderStatus(Number(req.params.id), req.body.status, req.user.userId);
      if (!order) return res.status(404).json({ success: false, message: "Order not found." });
      if (order.statusChanged) notifyOrderStatus(order);
      return res.json({ success: true, message: "Order status updated.", order });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
