import { Router } from "express";
import { body } from "express-validator";
import { authRequired, validateRequest } from "./middleware.js";
import Razorpay from "razorpay";
import crypto from "crypto";

const router = Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

router.post(
  "/create-order",
  authRequired,
  body("amount").isInt({ min: 100 }),
  body("currency").optional().isString(),
  validateRequest,
  async (req, res, next) => {
    try {
      const { amount, currency = "INR", receipt } = req.body;
      if (!amount || Number(amount) < 100) return res.status(400).json({ success: false, message: "Amount must be at least 100 paise." });
      const payload = { amount: Number(amount), currency, receipt: receipt || `rcpt_${Date.now()}` };
      const order = await razorpay.orders.create(payload);
      return res.json({ order_id: order.id, amount: order.amount, currency: order.currency });
    } catch (error) {
      if (error?.statusCode === 401) return res.status(401).json({ success: false, message: "Razorpay authentication failed." });
      return next(error);
    }
  }
);

router.post(
  "/verify-payment",
  authRequired,
  body("razorpay_order_id").notEmpty(),
  body("razorpay_payment_id").notEmpty(),
  body("razorpay_signature").notEmpty(),
  validateRequest,
  (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const generated = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    if (generated === razorpay_signature) return res.json({ success: true });
    return res.status(400).json({ success: false, message: "Signature mismatch." });
  }
);

export default router;
