import { Router } from "express";
import { body, param } from "express-validator";
import { authRequired, validateRequest } from "./middleware.js";
import { createAddress, deleteAddress, getAddress, getDefaultAddress, listAddresses, updateAddress } from "./address.repository.js";

const router = Router();
const fields = [body("fullName").trim().isLength({ min: 2, max: 80 }), body("mobileNumber").trim().matches(/^[0-9+() -]{7,20}$/), body("addressLine1").trim().isLength({ min: 3, max: 150 }), body("addressLine2").optional().trim().isLength({ max: 150 }), body("city").trim().isLength({ min: 2, max: 80 }), body("state").trim().isLength({ min: 2, max: 80 }), body("postalCode").trim().matches(/^[0-9A-Za-z -]{3,12}$/), body("country").optional().trim().isLength({ min: 2, max: 60 }), body("isDefault").optional().isBoolean()];
router.use(authRequired, (req, res, next) => req.user.role === "USER" ? next() : res.status(403).json({ success: false, message: "Customer access required." }));
router.get("/", async (req, res) => res.json({ addresses: await listAddresses(req.user.userId) }));
router.get("/default", async (req, res) => { const address = await getDefaultAddress(req.user.userId); return address ? res.json({ address }) : res.status(404).json({ success: false, message: "No default address found." }); });
router.post("/", fields, validateRequest, async (req, res) => res.status(201).json({ success: true, address: await createAddress(req.user.userId, req.body) }));
router.put("/:id", param("id").isInt({ min: 1 }), ...fields, validateRequest, async (req, res) => { const address = await updateAddress(req.user.userId, Number(req.params.id), req.body); return address ? res.json({ success: true, address }) : res.status(404).json({ success: false, message: "Address not found." }); });
router.delete("/:id", param("id").isInt({ min: 1 }), validateRequest, async (req, res) => { const address = await deleteAddress(req.user.userId, Number(req.params.id)); return address ? res.json({ success: true, message: "Address deleted." }) : res.status(404).json({ success: false, message: "Address not found." }); });
export default router;