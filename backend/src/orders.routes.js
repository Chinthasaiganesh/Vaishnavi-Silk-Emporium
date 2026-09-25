import { Router } from "express";
import { body, param } from "express-validator";
import { authRequired, validateRequest } from "./middleware.js";
import { placeOrder } from "./checkout.service.js";
import { cancelOrder, getOrder, listOrders, resubmitPaymentProof } from "./order.repository.js";
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
		const reservationId = req.get("Checkout-Reservation-Id")?.trim();
		if (!reservationId) return res.status(409).json({ success: false, code: "RESERVATION_REQUIRED", message: "Your checkout reservation is missing. Please return to checkout and reserve your items again." });
		const order = await placeOrder(req.user.userId, Number(req.body.addressId), idempotencyKey, req.requestId, paymentMethod, paymentReference, screenshot.url, reservationId);
		await sendOrderNotification(order, "Payment Submitted", "We have received your payment details and will verify them shortly.", "PAYMENT_STATUS");
		if (Number(order.DiscountAmount) > 0) {
			const saved = Number(order.DiscountAmount).toFixed(2);
			const originalTotal = order.items.reduce((sum, item) => sum + Number(item.OriginalPrice || item.ProductPrice || 0) * Number(item.Quantity || 0), 0);
			const percent = originalTotal > 0 ? (Number(order.DiscountAmount) / originalTotal) * 100 : 0;
			await sendOrderNotification(order, "You saved on this order", `You saved ₹${saved} (${Math.round(percent)}%) on order ${order.OrderNumber}. Thank you for shopping with us.`);
		}
		console.info(JSON.stringify({ level: "info", message: "Order response ready", requestId: req.requestId, userId: req.user.userId, orderId: order.OrderId, orderNumber: order.OrderNumber }));
		const conflictOrder = order.OrderStatus === "CANCELLED" && order.RefundStatus === "PENDING";
		return res.status(201).json({ success: true, message: conflictOrder ? "Payment proof saved. The item was no longer available, so this order was cancelled and the payment will be verified for refund." : "Order placed successfully.", order });
	} catch (error) {
		console.error(JSON.stringify({ level: "error", message: "Order controller failed", requestId: req.requestId, userId: req.user.userId, addressId: req.body.addressId, error: error.message, code: error.code, constraint: error.constraint, table: error.table, column: error.column, stack: error.stack }));
		return next(error);
	}
});
router.post("/:id/payment-proof", upload.single("paymentScreenshot"), param("id").isInt({ min: 1 }), body("paymentReference").trim().matches(/^[A-Za-z0-9][A-Za-z0-9._/-]{5,63}$/).withMessage("Enter a valid UPI transaction reference or UTR."), validateRequest, async (req, res, next) => {
	try {
		if (!req.file) return res.status(400).json({ success: false, message: "Payment screenshot is required." });
		const screenshot = await uploadImage(req.file.buffer, { originalName: req.file.originalname, mimetype: req.file.mimetype, folder: "payment-proofs" });
		const order = await resubmitPaymentProof(req.user.userId, Number(req.params.id), req.body.paymentReference.trim(), screenshot.url);
		if (!order) return res.status(409).json({ success: false, message: "Payment proof can only be re-submitted after a rejected verification." });
		await sendOrderNotification(order, "Payment Submitted", "We have received your updated payment details and will verify them shortly.", "PAYMENT_STATUS");
		return res.json({ success: true, message: "Payment proof submitted for review.", order });
	} catch (error) { return next(error); }
});
router.post("/:id/cancel", param("id").isInt({ min: 1 }), body("reason").trim().isLength({ min: 3, max: 300 }).withMessage("Cancellation reason must be between 3 and 300 characters."), validateRequest, async (req, res, next) => {
	try {
		const order = await cancelOrder(req.user.userId, Number(req.params.id), req.body.reason.trim());
		if (!order) return res.status(404).json({ success: false, message: "Order not found." });
		const refundMessage = order.RefundStatus === "NOT_APPLICABLE" ? "No submitted payment was found, so no refund is required." : order.PaymentStatus === "VERIFIED" ? "Your refund will be credited to the original payment method after processing." : "Refund tracking has started and processing will begin after payment verification.";
		await sendOrderNotification(order, "Order Cancelled Successfully", `Your order #${order.OrderNumber} has been cancelled. ${refundMessage}`);
		if (order.RefundStatus === "PENDING") await sendOrderNotification(order, "Refund Initiated", order.PaymentStatus === "VERIFIED" ? "Your refund request has been accepted." : "Refund tracking has started. Processing will begin after payment verification.", "REFUND_STATUS");
		return res.json({ success: true, message: "Order cancelled successfully", refundMessage, order });
	} catch (error) { return next(error); }
});
export default router;
