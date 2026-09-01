import { Router } from "express";
import { body } from "express-validator";
import { db } from "./db.js";
import { adminOnly, authRequired, validateRequest } from "./middleware.js";
import { nowIso } from "./utils.js";

const router = Router();

function mapSettings(row) {
  return { storeName: row.StoreName, tagline: row.Tagline, email: row.Email, phone: row.Phone, address: row.Address, businessDescription: row.BusinessDescription, updatedDate: row.UpdatedDate };
}

async function getSettings() {
  return await db.prepare("SELECT * FROM StoreSettings WHERE SettingsId = 1").get();
}

router.get("/store", authRequired, adminOnly, async (req, res) => {
  const settings = await getSettings();
  if (!settings) return res.status(404).json({ message: "Store settings have not been initialized." });
  return res.json({ settings: mapSettings(settings) });
});

router.put(
  "/store",
  authRequired,
  adminOnly,
  body("storeName").trim().isLength({ min: 2, max: 120 }).withMessage("Store name must be 2-120 characters."),
  body("tagline").trim().isLength({ max: 180 }).withMessage("Tagline must be at most 180 characters."),
  body("email").trim().isEmail().normalizeEmail().withMessage("Enter a valid store email address."),
  body("phone").trim().isLength({ min: 7, max: 30 }).withMessage("Enter a valid contact number."),
  body("address").trim().isLength({ min: 3, max: 300 }).withMessage("Address must be 3-300 characters."),
  body("businessDescription").trim().isLength({ max: 1000 }).withMessage("Business description must be at most 1000 characters."),
  validateRequest,
  async (req, res) => {
    const timestamp = nowIso();
    await db.prepare("INSERT INTO StoreSettings (SettingsId, StoreName, Tagline, Email, Phone, Address, BusinessDescription, UpdatedDate, UpdatedBy) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(SettingsId) DO UPDATE SET StoreName = excluded.StoreName, Tagline = excluded.Tagline, Email = excluded.Email, Phone = excluded.Phone, Address = excluded.Address, BusinessDescription = excluded.BusinessDescription, UpdatedDate = excluded.UpdatedDate, UpdatedBy = excluded.UpdatedBy").run(req.body.storeName, req.body.tagline, req.body.email, req.body.phone, req.body.address, req.body.businessDescription, timestamp, req.user.userId);
    return res.json({ settings: mapSettings(await getSettings()), message: "Store information saved successfully." });
  }
);

export default router;