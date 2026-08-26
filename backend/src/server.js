import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set("trust proxy", 1);

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    console.info(JSON.stringify({ level: "info", method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - startedAt }));
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
  }
}

app.get("/api/health", (req, res) => {
  try {
    db.prepare("SELECT 1").get();
    res.json({ status: "ok", database: "sqlite", environment: config.nodeEnv, timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "unavailable", timestamp: new Date().toISOString() });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/wishlists", wishlistRoutes);
app.use("/api/translations", translationRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/settings", settingsRoutes);

app.use(errorHandler);

ensureAdminUser().then(() => {
  app.listen(config.port, () => {
    console.log(`Backend running on http://localhost:${config.port}`);
  });
});
