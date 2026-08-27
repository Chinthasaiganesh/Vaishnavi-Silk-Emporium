import { Router } from "express";
import { body, param } from "express-validator";
import { authRequired, validateRequest } from "./middleware.js";
import { add, clear, get, remove, update } from "./cart.controller.js";

const router = Router();
const customerOnly = (req, res, next) => req.user?.role === "USER" ? next() : res.status(403).json({ success: false, message: "Customer access required." });

router.use(authRequired, customerOnly);
router.get("/", get);
router.post("/items", body("productId").isInt({ min: 1 }), body("quantity").isInt({ min: 1 }).withMessage("Quantity must be a positive integer."), validateRequest, add);
router.put("/items/:id", param("id").isInt({ min: 1 }), body("quantity").isInt({ min: 1 }).withMessage("Quantity must be a positive integer."), validateRequest, update);
router.delete("/items/:id", param("id").isInt({ min: 1 }), validateRequest, remove);
router.delete("/", clear);

export default router;