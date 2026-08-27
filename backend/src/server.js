import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { config } from "./config.js";
import { db } from "./db.js";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
  maxAge: 86400
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

async function ensureAdminUser() {
  const existingAdmin = db
    .prepare("SELECT UserId FROM Users WHERE Username = ?")
    .get(config.adminUsername);

  if (!existingAdmin) {
    const hash = await bcrypt.hash(config.adminPassword, 12);
    db.prepare("INSERT INTO Users (Username, PasswordHash, Role) VALUES (?, ?, 'ADMIN')").run(
      config.adminUsername,
      hash
    );
    console.log("Default admin user created.");
  } else {
    console.log("Admin already exists; preserving password and role.");
  }

  const existingUser = db
    .prepare("SELECT UserId FROM Users WHERE Username = ?")
    .get(config.userUsername);

  if (!existingUser) {
    const hash = await bcrypt.hash(config.userPassword, 12);
    db.prepare("INSERT INTO Users (Username, PasswordHash, Role) VALUES (?, ?, 'USER')").run(
      config.userUsername,
      hash
    );
    console.log("Default customer user created.");
  } else {
    console.log("Customer already exists; preserving account.");
  }

  const now = new Date().toISOString();
  initializeInventory();
  const insertCategory = db.prepare("INSERT OR IGNORE INTO Categories (CategoryName, Description, IsActive, CreatedDate, UpdatedDate) VALUES (?, ?, 1, ?, ?)");
  for (const [name, description] of Object.entries(defaultCategoryDescriptions)) {
    insertCategory.run(name, description, now, now);
  }
  db.prepare("INSERT OR IGNORE INTO StoreSettings (SettingsId, StoreName, Tagline, Email, Phone, Address, BusinessDescription, UpdatedDate, UpdatedBy) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    "Vaishnavi Silk Emporium",
    "Where Tradition Meets Elegance",
    "care@vaishnavisilks.example",
    "+91 90000 00000",
    "Hyderabad, Telangana",
    "Vaishnavi Silk Emporium curates timeless silk, cotton, handloom, Banarasi and Kanjivaram sarees for every occasion.",
    now,
    existingAdmin?.UserId || null
  );

  const categoryCount = db.prepare("SELECT COUNT(*) AS count FROM Categories").get().count;
  const productCount = db.prepare("SELECT COUNT(*) AS count FROM Products").get().count;
  const settings = db.prepare("SELECT SettingsId FROM StoreSettings WHERE SettingsId = 1").get();
  console.log(`Database initialization completed. Categories: ${categoryCount}; Products preserved: ${productCount}; Settings: ${settings ? "preserved" : "created"}.`);
}

app.get("/api/health", (req, res) => {
  try {
    db.prepare("SELECT 1").get();
    const inventory = db.prepare("SELECT COUNT(*) AS count FROM Products").get();
    res.json({ status: "ok", database: "sqlite", inventory: { status: "ok", routeRegistered: true, productCount: inventory.count }, environment: config.nodeEnv, timestamp: new Date().toISOString() });
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
