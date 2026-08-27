import { Router } from "express";
import { body, param } from "express-validator";
import { authRequired, adminOnly, validateRequest } from "./middleware.js";
import { details, list, lowStock, update } from "./inventory.controller.js";
import { getInventory } from "./inventory.service.js";

const router = Router();
const stockValidation = body("stock").isInt({ min: 0 }).withMessage("Stock must be a non-negative integer.");

router.get("/", authRequired, adminOnly, list);
router.get("/low-stock", authRequired, adminOnly, lowStock);
router.get("/:id", authRequired, adminOnly, param("id").isInt({ min: 1 }), validateRequest, details);
router.put("/:id", authRequired, adminOnly, param("id").isInt({ min: 1 }), stockValidation, validateRequest, update);
router.post("/update-stock", authRequired, adminOnly, body("productId").isInt({ min: 1 }), stockValidation, validateRequest, update);
router.post(
  "/restock",
  authRequired,
  adminOnly,
  body("productId").isInt({ min: 1 }),
  body("quantity").isInt({ min: 1 }).withMessage("Restock quantity must be a positive integer."),
  validateRequest,
  (req, res, next) => {
    try {
      const productId = Number(req.body.productId);
      const current = getInventory(productId);
      if (!current) return res.status(404).json({ success: false, message: "Inventory record not found." });
      req.body.stock = current.CurrentStock + Number(req.body.quantity);
      return update(req, res, "RESTOCKED");
    } catch (error) {
      return next(error);
    }
  }
);

export default router;