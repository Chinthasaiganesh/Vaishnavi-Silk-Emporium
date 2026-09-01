import { Router } from "express";
import { body, param } from "express-validator";
import { authRequired, validateRequest } from "./middleware.js";
import { placeOrder } from "./checkout.service.js";
import { cancelOrder, getOrder, listOrders } from "./order.repository.js";
import { db } from "./db.js";
import { nowIso } from "./utils.js";

const router = Router();
router.use(authRequired, (req, res, next) => req.user.role === "USER" ? next() : res.status(403).json({ success: false, message: "Customer access required." }));
router.get("/", async (req, res) => res.json({ orders: await listOrders(req.user.userId) }));
router.get("/:id", param("id").isInt({ min: 1 }), validateRequest, async (req, res) => { const order = await getOrder(req.user.userId, Number(req.params.id)); return order ? res.json({ order }) : res.status(404).json({ success: false, message: "Order not found." }); });
router.post("/", body("addressId").isInt({ min: 1 }).withMessage("Address required."), validateRequest, async (req, res, next) => {
	console.info(JSON.stringify({ level: "info", message: "Entered Order Controller", requestId: req.requestId, userId: req.user.userId, role: req.user.role, addressId: req.body.addressId, idempotencyKeyPresent: Boolean(req.get("Idempotency-Key")) }));
	try {
		const idempotencyKey = req.get("Idempotency-Key")?.trim().slice(0, 100);
		const order = await placeOrder(req.user.userId, Number(req.body.addressId), idempotencyKey, req.requestId);
		return res.status(201).json({ success: true, message: "Order placed successfully.", order });
	} catch (error) { return next(error); }
});
router.post("/:id/cancel", param("id").isInt({ min: 1 }), body("reason").optional().trim().isLength({ max: 300 }), validateRequest, async (req, res, next) => {
	try {
		const order = await cancelOrder(req.user.userId, Number(req.params.id), req.body.reason || "Customer requested cancellation");
		if (!order) return res.status(404).json({ success: false, message: "Order not found." });
		const refundMessage = order.RefundStatus === "NOT_APPLICABLE" ? "Since no payment was collected, no refund is required." : "Refunds, if applicable, will be credited to your original payment method within 2-3 business days.";
		await db.prepare("INSERT INTO Notifications (UserId, ProductId, OrderId, Type, Title, Message, CreatedDate) VALUES (?, NULL, ?, 'ORDER_STATUS', ?, ?, ?)").run(req.user.userId, order.OrderId, "Order Cancelled", `Your order ${order.OrderNumber} has been cancelled successfully. ${refundMessage}`, nowIso());
		return res.json({ success: true, message: "Order cancelled successfully", refundMessage, order });
	} catch (error) { return next(error); }
});
export default router;
