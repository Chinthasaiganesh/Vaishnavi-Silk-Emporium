import { Router } from "express";
import { body } from "express-validator";
import { validateRequest } from "./middleware.js";
import { translateText } from "./translation.service.js";

const router = Router();

router.post("/", body("text").trim().isLength({ min: 1, max: 5000 }), body("targetLanguage").isIn(["en", "te"]), validateRequest, async (req, res) => {
  const translation = await translateText(req.body.text, { targetLanguage: req.body.targetLanguage });
  return res.json(translation);
});

export default router;