import { Router } from "express";
import { param } from "express-validator";
import { db } from "./db.js";
import { authRequired, validateRequest } from "./middleware.js";
import { nowIso } from "./utils.js";

const router = Router();

function mapProduct(row) {
  const availableQuantity = Number(row.AvailableQuantity ?? 0);
  const reservedQuantity = Number(row.ReservedQuantity ?? 0);
  const temporarilyReserved = availableQuantity === 0 && reservedQuantity > 0;
  return { productId: row.ProductId, productName: row.ProductName, description: row.Description, category: row.Category, price: row.Price, imageUrl: row.ImageUrl, quantity: availableQuantity, currentStock: Number(row.CurrentStock ?? 0), availableQuantity, reservedQuantity, temporarilyReserved, rating: row.Rating, availabilityStatus: availableQuantity > 0 ? "In Stock" : temporarilyReserved ? "Temporarily Unavailable" : "Out of Stock", createdDate: row.WishlistCreatedDate };
}

router.get("/", authRequired, async (req, res) => {
  const products = await db.prepare("SELECT p.*, w.CreatedDate AS WishlistCreatedDate, COALESCE(i.CurrentStock, 0) AS CurrentStock, COALESCE(i.AvailableStock, 0) AS AvailableQuantity, COALESCE(i.ReservedStock, 0) AS ReservedQuantity FROM Wishlists w JOIN Products p ON p.ProductId = w.ProductId LEFT JOIN Inventory i ON i.ProductId = p.ProductId WHERE w.UserId = ? ORDER BY datetime(w.CreatedDate) DESC").all(req.user.userId);
  return res.json({ products: products.map(mapProduct) });
});

router.get("/:productId", authRequired, param("productId").isInt({ min: 1 }), validateRequest, async (req, res) => {
  const saved = await db.prepare("SELECT WishlistId FROM Wishlists WHERE UserId = ? AND ProductId = ?").get(req.user.userId, Number(req.params.productId));
  return res.json({ saved: Boolean(saved) });
});

router.post("/:productId", authRequired, param("productId").isInt({ min: 1 }), validateRequest, async (req, res) => {
  const productId = Number(req.params.productId);
  const product = await db.prepare("SELECT ProductId FROM Products WHERE ProductId = ? AND IsActive = 1").get(productId);
  if (!product) return res.status(404).json({ message: "Product not found." });
  try {
    await db.prepare("INSERT INTO Wishlists (UserId, ProductId, CreatedDate) VALUES (?, ?, ?)").run(req.user.userId, productId, nowIso());
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) return res.status(409).json({ message: "Product is already in your wishlist." });
    throw error;
  }
  return res.status(201).json({ saved: true, message: "Saved to wishlist." });
});

router.delete("/:productId", authRequired, param("productId").isInt({ min: 1 }), validateRequest, async (req, res) => {
  await db.prepare("DELETE FROM Wishlists WHERE UserId = ? AND ProductId = ?").run(req.user.userId, Number(req.params.productId));
  return res.json({ saved: false, message: "Removed from wishlist." });
});

export default router;