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
import { listExpiringReservations, releaseExpiredReservations } from "./reservation.repository.js";
import { sendReservationNotification } from "./notification.service.js";
import { logSafe, safeEndpoint } from "./safe-logger.js";

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
  req.requestId = crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);
  const startedAt = Date.now();
  res.on("finish", () => {
    logSafe("info", "http_request_completed", { requestId: req.requestId, endpoint: safeEndpoint(req), method: req.method, statusCode: res.statusCode, userId: req.user?.userId, role: req.user?.role, durationMs: Date.now() - startedAt });
  });
  next();
});

const corsOptions = {
  origin(origin, callback) {
    if (config.isAllowedOrigin(origin)) return callback(null, true);
    logSafe("warn", "cors_origin_rejected", { requestId: null, endpoint: "/cors", method: "OPTIONS" });
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "Checkout-Reservation-Id", "X-Request-Id"],
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
    logSafe("info", "default_admin_created");
  } else {
    logSafe("info", "default_admin_preserved");
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
    logSafe("info", "default_customer_created");
  } else {
    logSafe("info", "default_customer_preserved");
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

  logSafe("info", "database_initialization_completed");
}

app.get("/api/health", async (req, res) => {
  try {
    await db.prepare("SELECT 1").get();
    const totalProducts = (await db.prepare("SELECT COUNT(*) AS count FROM Products").get()).count;
    const activeProducts = (await db.prepare("SELECT COUNT(*) AS count FROM Products WHERE IsActive = 1").get()).count;
    const outOfStockProducts = (await db.prepare("SELECT COUNT(*) AS count FROM Inventory WHERE AvailableStock = 0").get()).count;
    res.json({ status: "ok", database: "postgresql", version: await getDatabaseVersion(), inventory: { status: "ok", routeRegistered: true, productCount: totalProducts, activeProducts, outOfStockProducts }, environment: config.nodeEnv, timestamp: new Date().toISOString() });
  } catch (error) {
    logSafe("error", "health_check_failed", { requestId: req.requestId, endpoint: "/api/health", method: req.method, statusCode: 503, diagnosticCode: error.code });
    res.status(503).json({ success: false, status: "unavailable", message: "Database unavailable.", timestamp: new Date().toISOString() });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/inventory", inventoryRoutes);
logSafe("info", "route_group_registered", { endpoint: "/api/inventory" });
app.use("/api/cart", cartRoutes);
logSafe("info", "route_group_registered", { endpoint: "/api/cart" });
app.use("/api/addresses", addressRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/orders", ordersRoutes);
logSafe("info", "route_group_registered", { endpoint: "/api/orders" });
app.use("/api/admin/orders", adminOrdersRoutes);
logSafe("info", "route_group_registered", { endpoint: "/api/admin/orders" });
app.use("/api/notifications", notificationRoutes);
app.use("/api/wishlists", wishlistRoutes);
app.use("/api/translations", translationRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/admin", adminUsersRoutes);

app.use(errorHandler);

ensureAdminUser().then(() => {
  const cleanupReservations = async () => {
    try {
      const expiring = await listExpiringReservations();
      for (const reservation of expiring) await sendReservationNotification(reservation.UserId, reservation.ReservationId, "Reservation Expiring Soon", "Hurry! Your reservation will expire soon. Complete payment within the next 2 minutes.", "RESERVATION_EXPIRING");
      const expired = await releaseExpiredReservations();
      for (const reservation of expired) await sendReservationNotification(reservation.UserId, reservation.ReservationId, "Reservation Expired", "Your checkout reservation expired and the items were released.", "RESERVATION_EXPIRED");
    } catch (error) {
      logSafe("error", "reservation_cleanup_failed", { endpoint: "/api/checkout/reservations", diagnosticCode: error.code });
    }
  };
  const reservationCleanupTimer = setInterval(cleanupReservations, 30_000);
  reservationCleanupTimer.unref?.();
  cleanupReservations();
  app.listen(config.port, () => {
    logSafe("info", "backend_started", { endpoint: "/api" });
  });
}).catch((error) => {
  logSafe("error", "backend_initialization_failed", { endpoint: "/startup", diagnosticCode: error.code });
  process.exitCode = 1;
});
