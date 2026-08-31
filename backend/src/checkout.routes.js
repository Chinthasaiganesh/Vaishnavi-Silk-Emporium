import { Router } from "express";
import { body } from "express-validator";
import { authRequired, validateRequest } from "./middleware.js";
import { getSummary, placeOrder, validateCheckout } from "./checkout.service.js";

const router = Router();
router.use(authRequired, (req, res, next) => req.user.role === "USER" ? next() : res.status(403).json({ success: false, message: "Customer access required." }));
router.get("/summary", (req, res, next) => { try { return res.json(getSummary(req.user.userId)); } catch (error) { return next(error); } });
router.post("/validate", body("addressId").optional().isInt({ min: 1 }), validateRequest, (req, res, next) => { try { const result = validateCheckout(req.user.userId, req.body.addressId ? Number(req.body.addressId) : null); return res.json({ success: true, ...result }); } catch (error) { return next(error); } });
export default router;
