import { Router } from "express";
import { body, param, query } from "express-validator";
import { db } from "./db.js";
import { authRequired, adminOnly, optionalAuth, validateRequest } from "./middleware.js";
import { upload } from "./upload.js";
import { nowIso, toBoolInt } from "./utils.js";
import { sendAvailabilityNotification } from "./notification.service.js";

const router = Router();

function mapProduct(row, canViewPrice = true) {
  if (!row) {
    return null;
  }
  return {
    productId: row.ProductId,
    productName: row.ProductName,
    description: row.Description,
    category: row.Category,
    ...(canViewPrice ? { price: row.Price } : {}),
    canViewPrice,
    imageUrl: row.ImageUrl,
    quantity: row.Quantity,
    isActive: Boolean(row.IsActive),
    isFeatured: Boolean(row.IsFeatured),
    fabric: row.Fabric,
    weavingStyle: row.WeavingStyle,
    colour: row.Colour,
    occasion: row.Occasion,
    sareeLength: row.SareeLength,
    blousePieceIncluded: Boolean(row.BlousePieceIncluded),
    careInstructions: row.CareInstructions,
    rating: row.Rating,
    availabilityStatus: row.Quantity > 0 ? "In Stock" : "Out of Stock",
    createdDate: row.CreatedDate,
    updatedDate: row.UpdatedDate
  };
}

router.get(
  "/public",
  optionalAuth,
  query("q").optional().trim(),
  query("category").optional().trim(),
  query("featured").optional().isBoolean().withMessage("featured must be true/false."),
  query("sort")
    .optional()
    .isIn(["", "price_asc", "price_desc", "alpha_asc"])
    .withMessage("Invalid sort option."),
  validateRequest,
  (req, res) => {
    const q = (req.query.q || "").trim().toLowerCase();
    const category = (req.query.category || "").trim().toLowerCase();
    const sort = req.query.sort || "";
    const featuredOnly = req.query.featured === "true";

    const canViewPrice = Boolean(req.user);
    const activeProducts = db.prepare("SELECT * FROM Products WHERE IsActive = 1").all();

    let products = activeProducts.filter((p) => {
      const text = `${p.ProductName} ${p.Description} ${p.Category} ${p.Fabric} ${p.Colour} ${p.Occasion} ${p.WeavingStyle}`.toLowerCase();
      const keywordMatch = !q || text.includes(q);
      const categoryMatch = !category || p.Category.toLowerCase() === category;
      const featuredMatch = !featuredOnly || (p.IsFeatured === 1 && p.Quantity > 0);
      return keywordMatch && categoryMatch && featuredMatch;
    });

    if (canViewPrice && sort === "price_asc") {
      products.sort((a, b) => a.Price - b.Price);
    } else if (canViewPrice && sort === "price_desc") {
      products.sort((a, b) => b.Price - a.Price);
    } else if (sort === "alpha_asc") {
      products.sort((a, b) => a.ProductName.localeCompare(b.ProductName));
    }

    return res.json({
      products: products.map((product) => mapProduct(product, canViewPrice))
    });
  }
);

router.get("/public/:id", optionalAuth, param("id").isInt({ min: 1 }), validateRequest, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM Products WHERE ProductId = ? AND IsActive = 1").get(id);
  if (!row) {
    return res.status(404).json({ message: "Product not found." });
  }
  return res.json({ product: mapProduct(row, Boolean(req.user)) });
});

router.get("/admin", authRequired, adminOnly, (req, res) => {
  const rows = db.prepare("SELECT * FROM Products ORDER BY datetime(CreatedDate) DESC").all();
  return res.json({ products: rows.map(mapProduct) });
});

router.get("/admin/summary", authRequired, adminOnly, (req, res) => {
  const totalProducts = db.prepare("SELECT COUNT(*) as count FROM Products").get().count;
  const activeProducts = db.prepare("SELECT COUNT(*) as count FROM Products WHERE IsActive = 1").get().count;
  const lowStockProducts = db
    .prepare("SELECT COUNT(*) as count FROM Products WHERE Quantity BETWEEN 1 AND 5")
    .get().count;

  return res.json({ totalProducts, activeProducts, lowStockProducts });
});

router.post(
  "/admin",
  authRequired,
  adminOnly,
  upload.single("image"),
  body("productName").trim().isLength({ min: 2 }).withMessage("Product name is required."),
  body("description").trim().isLength({ min: 10 }).withMessage("Description must be at least 10 chars."),
  body("category").trim().isLength({ min: 2 }).withMessage("Category is required."),
  body("price").isFloat({ min: 0 }).withMessage("Price must be non-negative."),
  body("quantity").isInt({ min: 0 }).withMessage("Quantity must be non-negative integer."),
  body("isActive").optional().isBoolean().withMessage("isActive must be true/false."),
  body("isFeatured").optional().isBoolean().withMessage("isFeatured must be true/false."),
  body("fabric").optional().trim().isLength({ max: 60 }),
  body("weavingStyle").optional().trim().isLength({ max: 80 }),
  body("colour").optional().trim().isLength({ max: 60 }),
  body("occasion").optional().trim().isLength({ max: 80 }),
  body("rating").optional().isFloat({ min: 0, max: 5 }),
  validateRequest,
  (req, res) => {
    const { productName, description, category, price, quantity } = req.body;
    const isActive = req.body.isActive === undefined ? false : req.body.isActive === "true";
    const isFeatured = req.body.isFeatured === "true" || req.body.isFeatured === true;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.imageUrl || "";

    const timestamp = nowIso();
    const result = db
      .prepare(
        `INSERT INTO Products
         (ProductName, Description, Category, Price, ImageUrl, Quantity, IsActive, IsFeatured, Fabric, WeavingStyle, Colour, Occasion, SareeLength, BlousePieceIncluded, CareInstructions, Rating, CreatedDate, UpdatedDate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        productName,
        description,
        category,
        Number(price),
        imageUrl,
        Number(quantity),
        toBoolInt(isActive),
        toBoolInt(isFeatured),
        req.body.fabric || "",
        req.body.weavingStyle || "",
        req.body.colour || "",
        req.body.occasion || "",
        req.body.sareeLength || "5.5 metres",
        toBoolInt(req.body.blousePieceIncluded === undefined || req.body.blousePieceIncluded === "true" || req.body.blousePieceIncluded === true),
        req.body.careInstructions || "Dry clean only.",
        Number(req.body.rating || 4.5),
        timestamp,
        timestamp
      );

    const created = db.prepare("SELECT * FROM Products WHERE ProductId = ?").get(result.lastInsertRowid);
    return res.status(201).json({ product: mapProduct(created) });
  }
);

router.put(
  "/admin/:id",
  authRequired,
  adminOnly,
  upload.single("image"),
  param("id").isInt({ min: 1 }),
  body("productName").trim().isLength({ min: 2 }).withMessage("Product name is required."),
  body("description").trim().isLength({ min: 10 }).withMessage("Description must be at least 10 chars."),
  body("category").trim().isLength({ min: 2 }).withMessage("Category is required."),
  body("price").isFloat({ min: 0 }).withMessage("Price must be non-negative."),
  body("quantity").isInt({ min: 0 }).withMessage("Quantity must be non-negative integer."),
  body("isActive").isBoolean().withMessage("isActive must be true/false."),
  body("isFeatured").isBoolean().withMessage("isFeatured must be true/false."),
  body("fabric").optional().trim().isLength({ max: 60 }),
  body("weavingStyle").optional().trim().isLength({ max: 80 }),
  body("colour").optional().trim().isLength({ max: 60 }),
  body("occasion").optional().trim().isLength({ max: 80 }),
  body("rating").optional().isFloat({ min: 0, max: 5 }),
  validateRequest,
  (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare("SELECT * FROM Products WHERE ProductId = ?").get(id);
    if (!existing) {
      return res.status(404).json({ message: "Product not found." });
    }

    const imageUrl = req.file
      ? `/uploads/${req.file.filename}`
      : req.body.imageUrl !== undefined
      ? req.body.imageUrl
      : existing.ImageUrl;

    db.prepare(
      `UPDATE Products
      SET ProductName = ?, Description = ?, Category = ?, Price = ?, ImageUrl = ?, Quantity = ?, IsActive = ?, IsFeatured = ?, Fabric = ?, WeavingStyle = ?, Colour = ?, Occasion = ?, SareeLength = ?, BlousePieceIncluded = ?, CareInstructions = ?, Rating = ?, UpdatedDate = ?
       WHERE ProductId = ?`
    ).run(
      req.body.productName,
      req.body.description,
      req.body.category,
      Number(req.body.price),
      imageUrl,
      Number(req.body.quantity),
      toBoolInt(req.body.isActive === "true" || req.body.isActive === true),
      toBoolInt(req.body.isFeatured === "true" || req.body.isFeatured === true),
      req.body.fabric || existing.Fabric,
      req.body.weavingStyle || existing.WeavingStyle,
      req.body.colour || existing.Colour,
      req.body.occasion || existing.Occasion,
      req.body.sareeLength || existing.SareeLength,
      toBoolInt(req.body.blousePieceIncluded === undefined ? existing.BlousePieceIncluded : req.body.blousePieceIncluded === "true" || req.body.blousePieceIncluded === true),
      req.body.careInstructions || existing.CareInstructions,
      Number(req.body.rating || existing.Rating),
      nowIso(),
      id
    );

    const isBackInStock = existing.Quantity === 0 && Number(req.body.quantity) > 0;
    if (isBackInStock) {
      sendAvailabilityNotification(id, req.body.productName);
    }

    const updated = db.prepare("SELECT * FROM Products WHERE ProductId = ?").get(id);
    return res.json({ product: mapProduct(updated) });
  }
);

router.delete(
  "/admin/:id",
  authRequired,
  adminOnly,
  param("id").isInt({ min: 1 }),
  validateRequest,
  (req, res) => {
    const id = Number(req.params.id);
    const result = db.prepare("DELETE FROM Products WHERE ProductId = ?").run(id);
    if (!result.changes) {
      return res.status(404).json({ message: "Product not found." });
    }
    return res.status(204).send();
  }
);

export default router;
