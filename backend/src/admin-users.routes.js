import { Router } from "express";
import bcrypt from "bcryptjs";
import { body, param } from "express-validator";
import { db } from "./db.js";
import { adminOnly, authRequired, validateRequest } from "./middleware.js";
import { nowIso } from "./utils.js";

const router = Router();

function mapAdmin(user) {
  return { userId: user.UserId, username: user.Username, fullName: user.FullName, displayName: user.DisplayName || user.FullName || user.Username, email: user.Email, mobileNumber: user.MobileNumber, isEnabled: Boolean(user.IsEnabled), createdDate: user.CreatedDate, lastLogin: user.LastLogin };
}

router.get("/users", authRequired, adminOnly, async (req, res) => {
  const users = await db.prepare("SELECT * FROM Users WHERE Role = 'ADMIN' ORDER BY datetime(CreatedDate) DESC").all();
  return res.json({ users: users.map(mapAdmin) });
});

router.post(
  "/users",
  authRequired,
  adminOnly,
  body("username").trim().isLength({ min: 3, max: 80 }).withMessage("Username must be 3-80 characters."),
  body("fullName").trim().isLength({ min: 2, max: 80 }).withMessage("Full name must be 2-80 characters."),
  body("displayName").trim().isLength({ min: 2, max: 40 }).withMessage("Display name must be 2-40 characters."),
  body("email").trim().isEmail().normalizeEmail().withMessage("Enter a valid email address."),
  body("password").isStrongPassword({ minLength: 10, minUppercase: 1, minLowercase: 1, minNumbers: 1, minSymbols: 1 }).withMessage("Password must include uppercase, lowercase, number, and symbol."),
  validateRequest,
  async (req, res) => {
    try {
      const passwordHash = await bcrypt.hash(req.body.password, 12);
      const result = await db.prepare("INSERT INTO Users (Username, PasswordHash, Role, FullName, DisplayName, Email, MobileNumber, CreatedDate, IsEnabled) VALUES (?, ?, 'ADMIN', ?, ?, ?, ?, ?, 1)").run(req.body.username, passwordHash, req.body.fullName, req.body.displayName, req.body.email, req.body.mobileNumber || "", nowIso());
      const user = await db.prepare("SELECT * FROM Users WHERE UserId = ?").get(result.lastInsertRowid);
      return res.status(201).json({ user: mapAdmin(user) });
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) return res.status(409).json({ message: "Username, email, or mobile number is already in use." });
      throw error;
    }
  }
);

router.put(
  "/users/:id",
  authRequired,
  adminOnly,
  param("id").isInt({ min: 1 }),
  body("fullName").trim().isLength({ min: 2, max: 80 }),
  body("displayName").trim().isLength({ min: 2, max: 40 }),
  body("email").trim().isEmail().normalizeEmail(),
  body("isEnabled").isBoolean(),
  body("newPassword").optional({ checkFalsy: true }).isStrongPassword({ minLength: 10, minUppercase: 1, minLowercase: 1, minNumbers: 1, minSymbols: 1 }),
  validateRequest,
  async (req, res) => {
    const targetId = Number(req.params.id);
    const target = await db.prepare("SELECT * FROM Users WHERE UserId = ? AND Role = 'ADMIN'").get(targetId);
    if (!target) return res.status(404).json({ message: "Admin user not found." });
    const isEnabled = req.body.isEnabled === true || req.body.isEnabled === "true";
    if (targetId === req.user.userId && !isEnabled) return res.status(400).json({ message: "You cannot disable your own admin account." });
    const passwordHash = req.body.newPassword ? await bcrypt.hash(req.body.newPassword, 12) : target.PasswordHash;
    try {
      await db.prepare("UPDATE Users SET FullName = ?, DisplayName = ?, Email = ?, MobileNumber = ?, IsEnabled = ?, PasswordHash = ? WHERE UserId = ?").run(req.body.fullName, req.body.displayName, req.body.email, req.body.mobileNumber || "", isEnabled ? 1 : 0, passwordHash, targetId);
      if (!isEnabled || req.body.newPassword) await db.prepare("DELETE FROM RefreshSessions WHERE UserId = ?").run(targetId);
      return res.json({ user: mapAdmin(await db.prepare("SELECT * FROM Users WHERE UserId = ?").get(targetId)) });
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) return res.status(409).json({ message: "Email or mobile number is already in use." });
      throw error;
    }
  }
);

router.delete("/users/:id", authRequired, adminOnly, param("id").isInt({ min: 1 }), validateRequest, async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.userId) return res.status(400).json({ message: "You cannot delete your own admin account." });
  const result = await db.prepare("DELETE FROM Users WHERE UserId = ? AND Role = 'ADMIN'").run(targetId);
  if (!result.changes) return res.status(404).json({ message: "Admin user not found." });
  return res.status(204).send();
});

export default router;