import crypto from "crypto";
import { db } from "./db.js";
import { nowIso } from "./utils.js";

function cacheKey(sourceLanguage, targetLanguage, text) {
  return crypto.createHash("sha256").update(`${sourceLanguage}:${targetLanguage}:${text}`).digest("hex");
}

export async function translateText(text, { sourceLanguage = "en", targetLanguage = "te" } = {}) {
  if (!text || sourceLanguage === targetLanguage) return { text, cached: true, provider: "identity" };
  const key = cacheKey(sourceLanguage, targetLanguage, text);
  const cached = await db.prepare("SELECT TranslatedText, Provider FROM TranslationCache WHERE CacheKey = ?").get(key);
  if (cached) return { text: cached.TranslatedText, cached: true, provider: cached.Provider };

  // Connect INDIC_TRANS2_URL to an internal IndicTrans2 inference service in production.
  // Returning source text keeps pages responsive until an approved provider is configured.
  const translatedText = text;
  const provider = process.env.INDIC_TRANS2_URL ? "indictrans2-pending" : "identity-fallback";
  await db.prepare("INSERT INTO TranslationCache (CacheKey, SourceLanguage, TargetLanguage, SourceText, TranslatedText, Provider, CreatedDate) VALUES (?, ?, ?, ?, ?, ?, ?)").run(key, sourceLanguage, targetLanguage, text, translatedText, provider, nowIso());
  return { text: translatedText, cached: false, provider };
}