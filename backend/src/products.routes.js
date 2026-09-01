import { Router } from "express";
import { body, param, query } from "express-validator";
import { db } from "./db.js";
import { authRequired, adminOnly, optionalAuth, validateRequest } from "./middleware.js";
import { upload } from "./upload.js";
import { uploadImage, deleteImage } from "./s3-storage.service.js";
import { nowIso, toBoolInt } from "./utils.js";
import { sendAvailabilityNotification } from "./notification.service.js";
import { initializeInventory, synchronizeProductInventory } from "./inventory.service.js";
import { getProductAudit, recordProductAudit } from "./product-audit.js";

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
    ...(canViewPrice ? { price: Number(row.Price) } : {}),
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

function auditValues(product) {
  return { productName: product.ProductName, category: product.Category, price: product.Price, quantity: product.Quantity, isActive: product.IsActive, isFeatured: product.IsFeatured };
}

async function productCounts() {
  return {
    totalProducts: (await db.prepare("SELECT COUNT(*) AS count FROM Products").get()).count,
    activeProducts: (await db.prepare("SELECT COUNT(*) AS count FROM Products WHERE IsActive = 1").get()).count,
    inactiveProducts: (await db.prepare("SELECT COUNT(*) AS count FROM Products WHERE IsActive = 0").get()).count,
    outOfStockProducts: (await db.prepare("SELECT COUNT(*) AS count FROM Products WHERE Quantity = 0").get()).count
  };
}

async function logProductEvent(message, requestId, details = {}) {
  console.info(JSON.stringify({ level: "info", message, requestId, ...details, counts: await productCounts() }));
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
  async (req, res) => {
    const q = (req.query.q || "").trim().toLowerCase();
    const category = (req.query.category || "").trim().toLowerCase();
    const sort = req.query.sort || "";
    const featuredOnly = req.query.featured === "true";

    const canViewPrice = Boolean(req.user);
    const activeProducts = await db.prepare("SELECT * FROM Products WHERE IsActive = 1").all();

    let products = activeProducts.filter((p) => {
      const text = `${p.ProductName} ${p.Description} ${p.Category} ${p.Fabric} ${p.Colour} ${p.Occasion} ${p.WeavingStyle}`.toLowerCase();
      const keywordMatch = !q || text.includes(q);
      const categoryMatch = !category || p.Category.toLowerCase() === category;
      const featuredMatch = !featuredOnly || p.IsFeatured === 1;
      return keywordMatch && categoryMatch && featuredMatch;
    });

    await logProductEvent("Product Loaded", req.requestId, { scope: "public-list", query: req.query, candidateCount: activeProducts.length, resultCount: products.length, filter: { category, featuredOnly } });

    if (canViewPrice && sort === "price_asc") {
      products.sort((a, b) => a.Price - b.Price);
    } else if (canViewPrice && sort === "price_desc") {
      products.sort((a, b) => b.Price - a.Price);
    } else if (sort === "alpha_asc") {
      products.sort((a, b) => a.ProductName.localeCompare(b.ProductName));
    }

    const mappedProducts = products.map((product) => mapProduct(product, canViewPrice));
    console.info(JSON.stringify({ level: "info", message: "Customer product prices retrieved", requestId: req.requestId, prices: mappedProducts.map((product) => ({ productId: product.productId, productName: product.productName, price: product.price ?? null })) }));
    return res.json({ products: mappedProducts });
  }
);

router.get("/public/:id", optionalAuth, param("id").isInt({ min: 1 }), validateRequest, async (req, res) => {
  const id = Number(req.params.id);
  const row = await db.prepare("SELECT * FROM Products WHERE ProductId = ? AND IsActive = 1").get(id);
  if (!row) {
    await logProductEvent("Product Load Miss", req.requestId, { scope: "public-detail", productId: id });
    return res.status(404).json({ message: "Product not found." });
  }
  await logProductEvent("Product Loaded", req.requestId, { scope: "public-detail", productId: id });
  return res.json({ product: mapProduct(row, Boolean(req.user)) });
});

router.get("/admin", authRequired, adminOnly, async (req, res) => {
  const rows = await db.prepare("SELECT * FROM Products ORDER BY datetime(CreatedDate) DESC").all();
  const products = rows.map((row) => mapProduct(row, true));
  await logProductEvent("Product Loaded", req.requestId, { scope: "admin-list", userId: req.user.userId, resultCount: products.length });
  console.info(JSON.stringify({ level: "info", message: "Admin product prices retrieved", requestId: req.requestId, userId: req.user.userId, prices: products.map((product) => ({ productId: product.productId, productName: product.productName, price: product.price })) }));
  return res.json({ products });
});

router.get("/admin/summary", authRequired, adminOnly, async (req, res) => {
  const totalProducts = (await db.prepare("SELECT COUNT(*) as count FROM Products").get()).count;
  const activeProducts = (await db.prepare("SELECT COUNT(*) as count FROM Products WHERE IsActive = 1").get()).count;
  const lowStockProducts = (await db
    .prepare("SELECT COUNT(*) as count FROM Products WHERE Quantity BETWEEN 1 AND 5")
    .get()).count;

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
  async (req, res) => {
    const { productName, description, category, price, quantity } = req.body;
    const isActive = req.body.isActive === undefined ? true : req.body.isActive === "true";
    const isFeatured = req.body.isFeatured === "true" || req.body.isFeatured === true;
    const imageUrl = req.file
      ? (await uploadImage(req.file.buffer, { originalName: req.file.originalname, mimetype: req.file.mimetype, folder: "products" })).url
      : req.body.imageUrl || "";

    const timestamp = nowIso();
    const result = await db
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

    const created = await db.prepare("SELECT * FROM Products WHERE ProductId = ?").get(result.lastInsertRowid);
    await logProductEvent("Product Created", req.requestId, { productId: created.ProductId, productName: created.ProductName, priceStored: created.Price, quantity: created.Quantity, isActive: created.IsActive });
    await recordProductAudit({ productId: created.ProductId, userId: req.user.userId, action: "CREATED", newValues: auditValues(created) });
    await initializeInventory();
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
  async (req, res) => {
    const id = Number(req.params.id);
    const existing = await db.prepare("SELECT * FROM Products WHERE ProductId = ?").get(id);
    if (!existing) {
      return res.status(404).json({ message: "Product not found." });
    }

    const imageUrl = req.file
      ? (await uploadImage(req.file.buffer, { originalName: req.file.originalname, mimetype: req.file.mimetype, folder: "products" })).url
      : req.body.imageUrl !== undefined
      ? req.body.imageUrl
      : existing.ImageUrl;

    if (req.file && existing.ImageUrl && existing.ImageUrl !== imageUrl) {
      await deleteImage(existing.ImageUrl);
    }

    const updatedValues = {
      productName: req.body.productName,
      category: req.body.category,
      price: Number(req.body.price),
      quantity: Number(req.body.quantity),
      isActive: toBoolInt(req.body.isActive === "true" || req.body.isActive === true),
      isFeatured: toBoolInt(req.body.isFeatured === "true" || req.body.isFeatured === true)
    };
    await db.prepare(
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

    await recordProductAudit({ productId: id, userId: req.user.userId, action: "UPDATED", oldValues: auditValues(existing), newValues: updatedValues });
    const updatedProduct = await db.prepare("SELECT * FROM Products WHERE ProductId = ?").get(id);
    await logProductEvent("Product Updated", req.requestId, { productId: id, productName: updatedProduct.ProductName, priceStored: updatedProduct.Price, oldQuantity: existing.Quantity, newQuantity: updatedProduct.Quantity, oldIsActive: existing.IsActive, newIsActive: updatedProduct.IsActive });
    await synchronizeProductInventory(updatedProduct);
    if (existing.IsActive !== updatedValues.isActive) await recordProductAudit({ productId: id, userId: req.user.userId, action: updatedValues.isActive ? "RESTORED" : "ARCHIVED", oldValues: { isActive: existing.IsActive }, newValues: { isActive: updatedValues.isActive } });
    if (existing.IsActive !== updatedValues.isActive) await recordProductAudit({ productId: id, userId: req.user.userId, action: "VISIBILITY_CHANGED", oldValues: { isActive: existing.IsActive }, newValues: { isActive: updatedValues.isActive } });

    const isBackInStock = existing.Quantity === 0 && Number(req.body.quantity) > 0;
    if (isBackInStock) {
      await sendAvailabilityNotification(id, req.body.productName);
    }

    return res.json({ product: mapProduct(updatedProduct) });
  }
);

router.delete(
  "/admin/:id",
  authRequired,
  adminOnly,
  param("id").isInt({ min: 1 }),
  validateRequest,
  async (req, res) => {
    const id = Number(req.params.id);
    const existing = await db.prepare("SELECT * FROM Products WHERE ProductId = ?").get(id);
    if (!existing) return res.status(404).json({ message: "Product not found." });
    await recordProductAudit({ productId: id, userId: req.user.userId, action: "DELETED", oldValues: auditValues(existing) });
    const result = await db.prepare("DELETE FROM Products WHERE ProductId = ?").run(id);
    if (!result.changes) {
      return res.status(404).json({ message: "Product not found." });
    }
    await logProductEvent("Product Deleted", req.requestId, { productId: id, productName: existing.ProductName, deletedBy: req.user.userId });
    return res.status(204).send();
  }
);

router.get("/admin/audit", authRequired, adminOnly, async (req, res) => {
  return res.json({ audits: await getProductAudit() });
});

export default router;
