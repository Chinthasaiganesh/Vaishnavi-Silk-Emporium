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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true
  })
);
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
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/wishlists", wishlistRoutes);
app.use("/api/translations", translationRoutes);
app.use("/api/categories", categoryRoutes);

app.use(errorHandler);

ensureAdminUser().then(() => {
  app.listen(config.port, () => {
    console.log(`Backend running on http://localhost:${config.port}`);
  });
});
