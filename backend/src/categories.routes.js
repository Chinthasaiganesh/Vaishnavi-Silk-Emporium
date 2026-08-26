import { Router } from "express";
import { body, param } from "express-validator";
import { db } from "./db.js";
import { adminOnly, authRequired, validateRequest } from "./middleware.js";
import { nowIso } from "./utils.js";

const router = Router();

function mapCategory(row) {
  return { categoryId: row.CategoryId, categoryName: row.CategoryName, description: row.Description, isActive: Boolean(row.IsActive), createdDate: row.CreatedDate, updatedDate: row.UpdatedDate, productCount: row.ProductCount || 0 };
}

router.get("/public", (req, res) => {
  const rows = db.prepare("SELECT Categories.*, COUNT(Products.ProductId) AS ProductCount FROM Categories LEFT JOIN Products ON Products.Category = Categories.CategoryName AND Products.IsActive = 1 WHERE Categories.IsActive = 1 GROUP BY Categories.CategoryId ORDER BY Categories.CategoryName").all();
  return res.json({ categories: rows.map(mapCategory) });
});

router.get("/", authRequired, adminOnly, (req, res) => {
  const rows = db.prepare("SELECT Categories.*, COUNT(Products.ProductId) AS ProductCount FROM Categories LEFT JOIN Products ON Products.Category = Categories.CategoryName GROUP BY Categories.CategoryId ORDER BY Categories.CategoryName").all();
  return res.json({ categories: rows.map(mapCategory) });
});

router.post("/", authRequired, adminOnly, body("categoryName").trim().isLength({ min: 2, max: 80 }), body("description").optional().trim().isLength({ max: 300 }), body("isActive").optional().isBoolean(), validateRequest, (req, res) => {
  try {
    const timestamp = nowIso();
    const result = db.prepare("INSERT INTO Categories (CategoryName, Description, IsActive, CreatedDate, UpdatedDate) VALUES (?, ?, ?, ?, ?)").run(req.body.categoryName, req.body.description || "", req.body.isActive === false || req.body.isActive === "false" ? 0 : 1, timestamp, timestamp);
    return res.status(201).json({ category: mapCategory(db.prepare("SELECT * FROM Categories WHERE CategoryId = ?").get(result.lastInsertRowid)) });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) return res.status(409).json({ message: "Category already exists." });
    throw error;
  }
});

router.put("/:id", authRequired, adminOnly, param("id").isInt({ min: 1 }), body("categoryName").trim().isLength({ min: 2, max: 80 }), body("description").optional().trim().isLength({ max: 300 }), body("isActive").isBoolean(), validateRequest, (req, res) => {
  const existing = db.prepare("SELECT * FROM Categories WHERE CategoryId = ?").get(Number(req.params.id));
  const result = db.prepare("UPDATE Categories SET CategoryName = ?, Description = ?, IsActive = ?, UpdatedDate = ? WHERE CategoryId = ?").run(req.body.categoryName, req.body.description || "", req.body.isActive === "true" || req.body.isActive === true ? 1 : 0, nowIso(), Number(req.params.id));
  if (!result.changes) return res.status(404).json({ message: "Category not found." });
  if (existing.CategoryName !== req.body.categoryName) db.prepare("UPDATE Products SET Category = ?, UpdatedDate = ? WHERE Category = ?").run(req.body.categoryName, nowIso(), existing.CategoryName);
  return res.json({ category: mapCategory(db.prepare("SELECT * FROM Categories WHERE CategoryId = ?").get(Number(req.params.id))) });
});

router.delete("/:id", authRequired, adminOnly, param("id").isInt({ min: 1 }), validateRequest, (req, res) => {
  const result = db.prepare("DELETE FROM Categories WHERE CategoryId = ?").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ message: "Category not found." });
  return res.status(204).send();
});

export default router;