import { Router } from "express";
import { body, param } from "express-validator";
import { authRequired, validateRequest } from "./middleware.js";
import { placeOrder } from "./checkout.service.js";
import { cancelOrder, getOrder, listOrders } from "./order.repository.js";
import { upload } from "./upload.js";
import { uploadImage } from "./s3-storage.service.js";
import { sendOrderNotification } from "./notification.service.js";

const router = Router();
router.use(authRequired, (req, res, next) => req.user.role === "USER" ? next() : res.status(403).json({ success: false, message: "Customer access required." }));
router.get("/", async (req, res) => res.json({ orders: await listOrders(req.user.userId) }));
router.get("/:id", param("id").isInt({ min: 1 }), validateRequest, async (req, res) => { const order = await getOrder(req.user.userId, Number(req.params.id)); return order ? res.json({ order }) : res.status(404).json({ success: false, message: "Order not found." }); });
router.post("/", upload.single("paymentScreenshot"), body("addressId").isInt({ min: 1 }).withMessage("Address required."), validateRequest, async (req, res, next) => {
	console.info(JSON.stringify({ level: "info", message: "Order request received", requestId: req.requestId, userId: req.user.userId, role: req.user.role, payload: { ...req.body, paymentReference: req.body.paymentReference ? "[present]" : null }, addressId: req.body.addressId, idempotencyKeyPresent: Boolean(req.get("Idempotency-Key")) }));
	try {
		const idempotencyKey = req.get("Idempotency-Key")?.trim().slice(0, 100);
		if (!idempotencyKey) return res.status(400).json({ success: false, message: "Idempotency-Key header is required. Please retry checkout." });
		const paymentMethod = req.body.paymentMethod || 'UPI_MANUAL';
		const paymentReference = req.body.paymentReference || null;
		if (paymentMethod !== "UPI_MANUAL" || !paymentReference || !req.file) return res.status(400).json({ success: false, message: "UPI reference and payment screenshot are required." });
		const screenshot = await uploadImage(req.file.buffer, { originalName: req.file.originalname, mimetype: req.file.mimetype, folder: "payment-proofs" });
		const order = await placeOrder(req.user.userId, Number(req.body.addressId), idempotencyKey, req.requestId, paymentMethod, paymentReference, screenshot.url);
		await sendOrderNotification(order, "Order Placed", `Your order ${order.OrderNumber} has been placed successfully.`);
		console.info(JSON.stringify({ level: "info", message: "Order response ready", requestId: req.requestId, userId: req.user.userId, orderId: order.OrderId, orderNumber: order.OrderNumber }));
		return res.status(201).json({ success: true, message: "Order placed successfully.", order });
	} catch (error) {
		console.error(JSON.stringify({ level: "error", message: "Order controller failed", requestId: req.requestId, userId: req.user.userId, addressId: req.body.addressId, error: error.message, code: error.code, constraint: error.constraint, table: error.table, column: error.column, stack: error.stack }));
		return next(error);
	}
});
router.post("/:id/cancel", param("id").isInt({ min: 1 }), body("reason").optional().trim().isLength({ max: 300 }), validateRequest, async (req, res, next) => {
	try {
		const order = await cancelOrder(req.user.userId, Number(req.params.id), req.body.reason || "Customer requested cancellation");
		if (!order) return res.status(404).json({ success: false, message: "Order not found." });
		const refundMessage = order.RefundStatus === "NOT_APPLICABLE" ? "Since no payment was collected, no refund is required." : "Refunds, if applicable, will be credited to your original payment method within 2-3 business days.";
		await sendOrderNotification(order, "Order Cancelled", `Your order ${order.OrderNumber} has been cancelled successfully. ${refundMessage}`);
		return res.json({ success: true, message: "Order cancelled successfully", refundMessage, order });
	} catch (error) { return next(error); }
});
export default router;
