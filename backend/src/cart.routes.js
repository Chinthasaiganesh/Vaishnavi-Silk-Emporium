import { Router } from "express";
import { body, param } from "express-validator";
import { authRequired, validateRequest } from "./middleware.js";
import { add, clear, get, remove, update } from "./cart.controller.js";
import { assertNoActivePaymentSession } from "./reservation.repository.js";

const router = Router();
const customerOnly = (req, res, next) => req.user?.role === "USER" ? next() : res.status(403).json({ success: false, message: "Customer access required." });
async function cartUnlocked(req, res, next) {
	try {
		await assertNoActivePaymentSession(req.user.userId);
		return next();
	} catch (error) {
		if (error.code === "ACTIVE_PAYMENT_SESSION") {
			return res.status(409).json({ success: false, code: error.code, message: error.message, activePaymentSession: error.activePaymentSession });
		}
		return next(error);
	}
}

router.use(authRequired, customerOnly);
router.get("/", get);
router.post("/items", body("productId").isInt({ min: 1 }), body("quantity").isInt({ min: 1 }).withMessage("Quantity must be a positive integer."), validateRequest, cartUnlocked, add);
router.put("/items/:id", param("id").isInt({ min: 1 }), body("quantity").isInt({ min: 1 }).withMessage("Quantity must be a positive integer."), validateRequest, cartUnlocked, update);
router.delete("/items/:id", param("id").isInt({ min: 1 }), validateRequest, cartUnlocked, remove);
router.delete("/", cartUnlocked, clear);

export default router;