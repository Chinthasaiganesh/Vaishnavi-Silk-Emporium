import express from "express";
import cors from "cors";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { config } from "./config.js";
import { db, getDatabaseVersion } from "./db.js";
import { errorHandler } from "./middleware.js";
import authRoutes from "./auth.routes.js";
import productRoutes from "./products.routes.js";
import notificationRoutes from "./notifications.routes.js";
import wishlistRoutes from "./wishlists.routes.js";
import translationRoutes from "./translations.routes.js";
import categoryRoutes from "./categories.routes.js";
import settingsRoutes from "./settings.routes.js";
import adminUsersRoutes from "./admin-users.routes.js";
import inventoryRoutes from "./inventory.routes.js";
import { initializeInventory } from "./inventory.service.js";
import cartRoutes from "./cart.routes.js";
import addressRoutes from "./address.routes.js";
import checkoutRoutes from "./checkout.routes.js";
import ordersRoutes from "./orders.routes.js";
import adminOrdersRoutes from "./admin-orders.routes.js";

const app = express();

const defaultCategoryDescriptions = {
  "Silk Sarees": "Luxurious silk sarees for timeless occasions.",
  "Banarasi Sarees": "Elegant Banarasi weaves with traditional zari artistry.",
  "Kanjivaram Sarees": "Heritage Kanjivaram silks for celebrations and weddings.",
  "Cotton Sarees": "Breathable cotton sarees for graceful everyday wear.",
  "Bridal Sarees": "Statement sarees curated for bridal moments.",
  "Designer Sarees": "Contemporary drapes with signature detailing.",
  "Festive Sarees": "Vibrant sarees for festivals and traditional events.",
  "Linen Sarees": "Lightweight linen weaves with effortless elegance.",
  "Handloom Sarees": "Artisan handloom sarees celebrating Indian craft."
};

app.set("trust proxy", 1);

app.use((req, res, next) => {
  req.requestId = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);
  if (req.method === "OPTIONS" || req.method === "PATCH") {
    console.info(JSON.stringify({ level: "info", message: "CORS-sensitive request received", requestId: req.requestId, method: req.method, url: req.originalUrl, origin: req.headers.origin || null, accessControlRequestMethod: req.headers["access-control-request-method"] || null, accessControlRequestHeaders: req.headers["access-control-request-headers"] || null, authorizationPresent: Boolean(req.headers.authorization) }));
  }
  const startedAt = Date.now();
  res.on("finish", () => {
    console.info(JSON.stringify({ level: "info", requestId: req.requestId, method: req.method, url: req.originalUrl, status: res.statusCode, userId: req.user?.userId || null, role: req.user?.role || null, durationMs: Date.now() - startedAt }));
  });
  next();
});

const corsOptions = {
  origin(origin, callback) {
    if (config.isAllowedOrigin(origin)) return callback(null, true);
    console.warn(JSON.stringify({ level: "warn", message: "CORS origin rejected", origin }));
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Request-Id"],
  exposedHeaders: ["x-request-id"],
  optionsSuccessStatus: 204,
  maxAge: 86400
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

async function ensureAdminUser() {
  const existingAdmin = await db
    .prepare("SELECT UserId FROM Users WHERE Username = ?")
    .get(config.adminUsername);

  if (!existingAdmin) {
    const hash = await bcrypt.hash(config.adminPassword, 12);
    await db.prepare("INSERT INTO Users (Username, PasswordHash, Role) VALUES (?, ?, 'ADMIN')").run(
      config.adminUsername,
      hash
    );
    console.log("Default admin user created.");
  } else {
    console.log("Admin already exists; preserving password and role.");
  }

  const existingUser = await db
    .prepare("SELECT UserId FROM Users WHERE Username = ?")
    .get(config.userUsername);

  if (!existingUser) {
    const hash = await bcrypt.hash(config.userPassword, 12);
    await db.prepare("INSERT INTO Users (Username, PasswordHash, Role) VALUES (?, ?, 'USER')").run(
      config.userUsername,
      hash
    );
    console.log("Default customer user created.");
  } else {
    console.log("Customer already exists; preserving account.");
  }

  const now = new Date().toISOString();
  await initializeInventory();
  const insertCategory = await db.prepare("INSERT OR IGNORE INTO Categories (CategoryName, Description, IsActive, CreatedDate, UpdatedDate) VALUES (?, ?, 1, ?, ?)");
  for (const [name, description] of Object.entries(defaultCategoryDescriptions)) {
    await insertCategory.run(name, description, now, now);
  }
  await db.prepare("INSERT OR IGNORE INTO StoreSettings (SettingsId, StoreName, Tagline, Email, Phone, Address, BusinessDescription, UpdatedDate, UpdatedBy) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    "Vaishnavi Silk Emporium",
    "Where Tradition Meets Elegance",
    "care@vaishnavisilks.example",
    "+91 90000 00000",
    "Hyderabad, Telangana",
    "Vaishnavi Silk Emporium curates timeless silk, cotton, handloom, Banarasi and Kanjivaram sarees for every occasion.",
    now,
    existingAdmin?.UserId || null
  );

  const categoryCount = (await db.prepare("SELECT COUNT(*) AS count FROM Categories").get()).count;
  const productCount = (await db.prepare("SELECT COUNT(*) AS count FROM Products").get()).count;
  const settings = await db.prepare("SELECT SettingsId FROM StoreSettings WHERE SettingsId = 1").get();
  const inventoryCount = (await db.prepare("SELECT COUNT(*) AS count FROM Inventory").get()).count;
  const orphanInventoryCount = (await db.prepare("SELECT COUNT(*) AS count FROM Inventory i LEFT JOIN Products p ON p.ProductId = i.ProductId WHERE p.ProductId IS NULL").get()).count;
  console.log(`Database initialization completed. Categories: ${categoryCount}; Products preserved: ${productCount}; Inventory records: ${inventoryCount}; Orphan inventory: ${orphanInventoryCount}; Settings: ${settings ? "preserved" : "created"}.`);
}

app.get("/api/health", async (req, res) => {
  try {
    await db.prepare("SELECT 1").get();
    const totalProducts = (await db.prepare("SELECT COUNT(*) AS count FROM Products").get()).count;
    const activeProducts = (await db.prepare("SELECT COUNT(*) AS count FROM Products WHERE IsActive = 1").get()).count;
    const outOfStockProducts = (await db.prepare("SELECT COUNT(*) AS count FROM Products WHERE Quantity = 0").get()).count;
    res.json({ status: "ok", database: "postgresql", version: await getDatabaseVersion(), inventory: { status: "ok", routeRegistered: true, productCount: totalProducts, activeProducts, outOfStockProducts }, environment: config.nodeEnv, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", message: "Health check failed", requestId: req.requestId, error: error.message, stack: error.stack }));
    res.status(503).json({ success: false, status: "unavailable", message: "Database unavailable.", timestamp: new Date().toISOString() });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/inventory", inventoryRoutes);
console.info(JSON.stringify({ level: "info", message: "Inventory routes registered", basePath: "/api/inventory" }));
app.use("/api/cart", cartRoutes);
console.info(JSON.stringify({
  level: "info",
  message: "Cart routes registered",
  basePath: "/api/cart",
  routes: [
    "GET /api/cart",
    "POST /api/cart/items",
    "PUT /api/cart/items/:id",
    "DELETE /api/cart/items/:id",
    "DELETE /api/cart"
  ]
}));
app.use("/api/addresses", addressRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/orders", ordersRoutes);
console.info(JSON.stringify({
  level: "info",
  message: "Order routes registered",
  basePath: "/api/orders",
  routes: [
    "GET /api/orders",
    "GET /api/orders/:id",
    "POST /api/orders"
  ]
}));
app.use("/api/admin/orders", adminOrdersRoutes);
console.info(JSON.stringify({
  level: "info",
  message: "Admin order routes registered",
  basePath: "/api/admin/orders",
  routes: [
    "GET /api/admin/orders",
    "GET /api/admin/orders/:id",
    "PATCH /api/admin/orders/:id/status"
  ]
}));
app.use("/api/notifications", notificationRoutes);
app.use("/api/wishlists", wishlistRoutes);
app.use("/api/translations", translationRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/admin", adminUsersRoutes);

app.use(errorHandler);

ensureAdminUser().then(() => {
  app.listen(config.port, () => {
    console.log(`Backend running on http://localhost:${config.port}`);
  });
});
