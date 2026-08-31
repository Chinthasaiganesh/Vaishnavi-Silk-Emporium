import jwt from "jsonwebtoken";
import { validationResult } from "express-validator";
import { config } from "./config.js";

export function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    console.warn(JSON.stringify({ level: "warn", message: "Authentication required", requestId: req.requestId, method: req.method, url: req.originalUrl, authorizationPresent: Boolean(authHeader) }));
    return res.status(401).json({ success: false, message: "Authentication required." });
  }

  try {
    req.user = jwt.verify(token, config.jwtSecret);
    console.info(JSON.stringify({ level: "info", message: "Authentication succeeded", requestId: req.requestId, method: req.method, url: req.originalUrl, userId: req.user.userId, role: req.user.role }));
    return next();
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", message: "JWT verification failed", requestId: req.requestId, method: req.method, url: req.originalUrl, error: error.message }));
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
    console.warn(JSON.stringify({ level: "warn", message: "Request validation failed", method: req.method, path: req.path, params: req.params, body: req.body, errors: validationErrors }));
    return res.status(400).json({
      success: false,
      message: "Validation failed.",
      errors: validationErrors
    });
  }
  return next();
}

export function errorHandler(err, req, res, next) {
  console.error(JSON.stringify({ level: "error", message: "Unhandled request error", requestId: req.requestId, method: req.method, url: req.originalUrl, params: req.params, body: req.body, error: err.message, stack: err.stack }));
  if (res.headersSent) {
    return next(err);
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "File size exceeds 5 MB limit." });
  }
  if (err.message === "Only JPG, PNG, and WEBP images are allowed.") {
    return res.status(400).json({ message: err.message });
  }
  return res.status(err.status || 500).json({ success: false, message: err.status ? err.message : "Internal server error.", requestId: req.requestId });
}
