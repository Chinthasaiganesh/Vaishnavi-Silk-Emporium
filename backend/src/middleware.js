import jwt from "jsonwebtoken";
import { validationResult } from "express-validator";
import { config } from "./config.js";
import { logSafe, safeEndpoint } from "./safe-logger.js";

export function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    logSafe("warn", "authentication_required", { requestId: req.requestId, endpoint: safeEndpoint(req), method: req.method });
    return res.status(401).json({ success: false, message: "Authentication required." });
  }

  try {
    req.user = jwt.verify(token, config.jwtSecret);
    logSafe("info", "authentication_succeeded", { requestId: req.requestId, endpoint: safeEndpoint(req), method: req.method, userId: req.user.userId, role: req.user.role });
    return next();
  } catch (error) {
    logSafe("warn", "jwt_verification_failed", { requestId: req.requestId, endpoint: safeEndpoint(req), method: req.method });
    return res.status(401).json({ success: false, message: "Session expired. Please login again." });
  }
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, config.jwtSecret);
    } catch {
      req.user = null;
    }
  }
  return next();
}

export function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "Admin access required." });
  }
  return next();
}

export function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const validationErrors = errors.array().map((error) => ({ field: error.path, message: error.msg }));
    logSafe("warn", "request_validation_failed", { requestId: req.requestId, endpoint: safeEndpoint(req), method: req.method, statusCode: 400, userId: req.user?.userId });
    return res.status(400).json({
      success: false,
      message: "Validation failed.",
      errors: validationErrors
    });
  }
  return next();
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "File size exceeds 5 MB limit." });
  }
  if (err.message === "Only JPG, PNG, and WEBP images are allowed.") {
    return res.status(400).json({ message: err.message });
  }
  const postgresMessages = {
    "42P01": "Required database table is missing.",
    "42703": "The database schema is out of date. Restart or redeploy the backend so startup migrations can complete.",
    "23503": "Referenced user, address, product, or order record does not exist.",
    "23505": "This order already exists. Retry with a new checkout request.",
    "23502": "A required order field is missing.",
    "40001": "The order transaction conflicted with another update. Please retry."
  };
  const status = err.status || (postgresMessages[err.code] ? (err.code === "23505" ? 409 : err.code === "23503" ? 404 : 500) : 500);
  const message = err.status ? err.message : postgresMessages[err.code] || "Database transaction failed.";
  logSafe("error", "request_failed", { requestId: req.requestId, endpoint: safeEndpoint(req), method: req.method, statusCode: status, userId: req.user?.userId, role: req.user?.role, diagnosticCode: err.code || "APPLICATION_ERROR" });
  return res.status(status).json({ success: false, message, requestId: req.requestId, diagnosticCode: err.code || "APPLICATION_ERROR", ...(err.activePaymentSession ? { activePaymentSession: err.activePaymentSession } : {}), ...(Number.isFinite(err.availableStock) ? { availableStock: err.availableStock } : {}), ...(Number.isFinite(err.reservedStock) ? { reservedStock: err.reservedStock } : {}), ...(Number.isFinite(err.currentStock) ? { currentStock: err.currentStock } : {}) });
}
