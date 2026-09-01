import { Router } from "express";
import { param } from "express-validator";
import { db } from "./db.js";
import { authRequired, validateRequest } from "./middleware.js";
import { nowIso } from "./utils.js";

const router = Router();

function mapProduct(row) {
  return { productId: row.ProductId, productName: row.ProductName, description: row.Description, category: row.Category, price: row.Price, imageUrl: row.ImageUrl, quantity: row.Quantity, rating: row.Rating, availabilityStatus: row.Quantity > 0 ? "In Stock" : "Out of Stock", createdDate: row.WishlistCreatedDate };
}

router.get("/", authRequired, async (req, res) => {
  const products = await db.prepare("SELECT Products.*, Wishlists.CreatedDate AS WishlistCreatedDate FROM Wishlists JOIN Products ON Products.ProductId = Wishlists.ProductId WHERE Wishlists.UserId = ? ORDER BY datetime(Wishlists.CreatedDate) DESC").all(req.user.userId);
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