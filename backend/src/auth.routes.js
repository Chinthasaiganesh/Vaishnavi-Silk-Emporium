import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { body } from "express-validator";
import { db } from "./db.js";
import { config } from "./config.js";
import { authRequired, validateRequest } from "./middleware.js";
import { upload, validateAvatarDimensions } from "./upload.js";

const router = Router();
const accessTokenLifetime = "15m";
const refreshTokenLifetimeDays = 7;
const oauthStateLifetime = "10m";

function mapUser(user) {
  let preferences = {};
  try {
    preferences = JSON.parse(user.Preferences || "{}");
  } catch {
    preferences = {};
  }
  return {
    userId: user.UserId,
    username: user.Username,
    role: user.Role,
    fullName: user.FullName,
    displayName: user.DisplayName || user.FullName || user.Username,
    email: user.Email,
    avatarUrl: user.AvatarUrl,
    mobileNumber: user.MobileNumber,
    preferences,
    createdDate: user.CreatedDate,
    lastLogin: user.LastLogin
  };
}

function readRefreshToken(req) {
  const cookie = req.headers.cookie || "";
  const entry = cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("refresh_session="));
  return entry ? decodeURIComponent(entry.slice("refresh_session=".length)) : null;
}

function setRefreshCookie(res, token, rememberMe) {
  const maxAge = rememberMe ? refreshTokenLifetimeDays * 24 * 60 * 60 * 1000 : undefined;
  res.cookie("refresh_session", token, {
    httpOnly: true,
    sameSite: config.nodeEnv === "production" ? "none" : "lax",
    secure: config.nodeEnv === "production",
    path: "/api/auth",
    ...(maxAge ? { maxAge } : {})
  });
}

function issueAccessToken(user) {
  return jwt.sign(
    { userId: user.UserId, username: user.Username, role: user.Role },
    config.jwtSecret,
    { expiresIn: accessTokenLifetime }
  );
}

function issueRefreshSession(user, rememberMe) {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + refreshTokenLifetimeDays * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO RefreshSessions (SessionId, UserId, ExpiresAt, CreatedDate) VALUES (?, ?, ?, ?)").run(
    sessionId,
    user.UserId,
    expiresAt,
    new Date().toISOString()
  );
  return jwt.sign({ sessionId, type: "refresh", rememberMe }, config.jwtSecret, { expiresIn: `${refreshTokenLifetimeDays}d` });
}

function oauthRedirectUri(provider) {
  return `${config.publicApiOrigin}/api/auth/oauth/${provider}/callback`;
}

function configuredProvider(provider) {
  return provider === "google"
    ? config.googleClientId && config.googleClientSecret
    : config.githubClientId && config.githubClientSecret;
}

function startUserSession(res, user) {
  const token = issueAccessToken(user);
  setRefreshCookie(res, issueRefreshSession(user, true), true);
  return token;
}

async function getOAuthProfile(provider, code) {
  const redirectUri = oauthRedirectUri(provider);
  if (provider === "google") {
    const tokens = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.googleClientId, client_secret: config.googleClientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }) }).then((response) => response.ok ? response.json() : Promise.reject(new Error("Google token exchange failed.")));
    const profile = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } }).then((response) => response.ok ? response.json() : Promise.reject(new Error("Google profile request failed.")));
    return { provider: "google", subject: profile.sub, email: profile.email, name: profile.name || profile.email, avatarUrl: profile.picture || null };
  }

  const tokens = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.githubClientId, client_secret: config.githubClientSecret, redirect_uri: redirectUri }) }).then((response) => response.ok ? response.json() : Promise.reject(new Error("GitHub token exchange failed.")));
  const profile = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "BlueOrbit-Commerce" } }).then((response) => response.ok ? response.json() : Promise.reject(new Error("GitHub profile request failed.")));
  const emails = await fetch("https://api.github.com/user/emails", { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "BlueOrbit-Commerce" } }).then((response) => response.ok ? response.json() : Promise.resolve([]));
  const email = profile.email || emails.find((item) => item.primary && item.verified)?.email;
  return { provider: "github", subject: String(profile.id), email, name: profile.name || profile.login, avatarUrl: profile.avatar_url || null };
}

function findOrCreateOAuthUser(profile) {
  if (!profile.subject || !profile.email) throw new Error("Your social account must provide a verified email address.");
  let user = db.prepare("SELECT * FROM Users WHERE OAuthProvider = ? AND OAuthSubject = ?").get(profile.provider, profile.subject);
  if (user) return user;
  user = db.prepare("SELECT * FROM Users WHERE Email = ?").get(profile.email);
  if (user) {
    db.prepare("UPDATE Users SET OAuthProvider = ?, OAuthSubject = ?, AvatarUrl = COALESCE(AvatarUrl, ?) WHERE UserId = ?").run(profile.provider, profile.subject, profile.avatarUrl, user.UserId);
    return db.prepare("SELECT * FROM Users WHERE UserId = ?").get(user.UserId);
  }
  const createdDate = new Date().toISOString();
  const username = profile.email;
  const passwordHash = crypto.randomBytes(48).toString("hex");
  const result = db.prepare("INSERT INTO Users (Username, PasswordHash, Role, FullName, DisplayName, Email, AvatarUrl, CreatedDate, OAuthProvider, OAuthSubject) VALUES (?, ?, 'USER', ?, ?, ?, ?, ?, ?, ?)").run(username, passwordHash, profile.name, profile.name, profile.email, profile.avatarUrl, createdDate, profile.provider, profile.subject);
  return db.prepare("SELECT * FROM Users WHERE UserId = ?").get(result.lastInsertRowid);
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again later." }
});

router.get("/oauth/providers", (req, res) => {
  return res.json({
    google: Boolean(configuredProvider("google")),
    github: Boolean(configuredProvider("github"))
  });
});

router.get("/oauth/:provider", (req, res) => {
  const provider = req.params.provider;
  if (!["google", "github"].includes(provider) || !configuredProvider(provider)) return res.redirect(`${config.clientOrigin}/login?oauthError=provider_not_configured`);
  const state = jwt.sign({ provider, type: "oauth_state" }, config.jwtSecret, { expiresIn: oauthStateLifetime });
  const redirectUri = oauthRedirectUri(provider);
  const authorizationUrl = provider === "google"
    ? `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: config.googleClientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, prompt: "select_account" })}`
    : `https://github.com/login/oauth/authorize?${new URLSearchParams({ client_id: config.githubClientId, redirect_uri: redirectUri, scope: "read:user user:email", state })}`;
  return res.redirect(authorizationUrl);
});

router.get("/oauth/:provider/callback", async (req, res) => {
  const provider = req.params.provider;
  try {
    const state = jwt.verify(req.query.state, config.jwtSecret);
    if (state.type !== "oauth_state" || state.provider !== provider || !req.query.code || !configuredProvider(provider)) throw new Error("Invalid OAuth response.");
    const user = findOrCreateOAuthUser(await getOAuthProfile(provider, req.query.code));
    db.prepare("UPDATE Users SET LastLogin = ? WHERE UserId = ?").run(new Date().toISOString(), user.UserId);
    startUserSession(res, user);
    return res.redirect(`${config.clientOrigin}/oauth/callback`);
  } catch (error) {
    console.error("OAuth callback failed:", error.message);
    return res.redirect(`${config.clientOrigin}/login?oauthError=authentication_failed`);
  }
});

router.post(
  "/register",
  loginLimiter,
  body("fullName").trim().isLength({ min: 2, max: 80 }).withMessage("Full name must be 2-80 characters."),
  body("displayName").trim().isLength({ min: 2, max: 40 }).withMessage("Display name must be 2-40 characters."),
  body("email").trim().isEmail().normalizeEmail().withMessage("Enter a valid email address."),
  body("mobileNumber").trim().matches(/^[0-9]{7,15}$/).withMessage("Enter a valid mobile number."),
  body("password").isStrongPassword({ minLength: 8, minUppercase: 1, minLowercase: 1, minNumbers: 1, minSymbols: 1 }).withMessage("Password must include upper/lowercase letters, a number, and a symbol."),
  body("confirmPassword").custom((value, { req }) => value === req.body.password).withMessage("Passwords do not match."),
  validateRequest,
  async (req, res) => {
    const { fullName, displayName, email, mobileNumber, password } = req.body;
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const createdDate = new Date().toISOString();
      const result = db.prepare("INSERT INTO Users (Username, PasswordHash, Role, FullName, DisplayName, Email, MobileNumber, CreatedDate) VALUES (?, ?, 'USER', ?, ?, ?, ?, ?)").run(
        email,
        passwordHash,
        fullName,
        displayName,
        email,
        mobileNumber,
        createdDate
      );
      const user = db.prepare("SELECT * FROM Users WHERE UserId = ?").get(result.lastInsertRowid);
      const token = issueAccessToken(user);
      setRefreshCookie(res, issueRefreshSession(user, true), true);
      return res.status(201).json({ token, user: mapUser(user) });
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        return res.status(409).json({ message: "An account already uses that email address or mobile number." });
      }
      throw error;
    }
  }
);

router.post(
  "/login",
  loginLimiter,
  body("identifier").trim().isLength({ min: 3 }).withMessage("Email, mobile number, or username is required."),
  body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters."),
  validateRequest,
  async (req, res) => {
    const { identifier, password } = req.body;
    const user = db.prepare("SELECT * FROM Users WHERE Username = ? OR Email = ? OR MobileNumber = ?").get(identifier, identifier, identifier);

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }
    if (!user.IsEnabled) {
      return res.status(403).json({ message: "This account has been disabled. Contact an administrator." });
    }

    const isValid = await bcrypt.compare(password, user.PasswordHash);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const rememberMe = Boolean(req.body.rememberMe);
    const lastLogin = new Date().toISOString();
    db.prepare("UPDATE Users SET LastLogin = ? WHERE UserId = ?").run(lastLogin, user.UserId);
    const authenticatedUser = db.prepare("SELECT * FROM Users WHERE UserId = ?").get(user.UserId);
    const token = issueAccessToken(authenticatedUser);
    setRefreshCookie(res, issueRefreshSession(authenticatedUser, rememberMe), rememberMe);

    return res.json({
      token,
      user: mapUser(authenticatedUser)
    });
  }
);

router.post("/refresh", (req, res) => {
  const refreshToken = readRefreshToken(req);
  if (!refreshToken) {
    return res.status(401).json({ message: "Session expired. Please sign in again." });
  }

  try {
    const payload = jwt.verify(refreshToken, config.jwtSecret);
    if (payload.type !== "refresh" || !payload.sessionId) {
      return res.status(401).json({ message: "Invalid session." });
    }

    const session = db.prepare("SELECT * FROM RefreshSessions WHERE SessionId = ?").get(payload.sessionId);
    if (!session || new Date(session.ExpiresAt) <= new Date()) {
      db.prepare("DELETE FROM RefreshSessions WHERE SessionId = ?").run(payload.sessionId);
      return res.status(401).json({ message: "Session expired. Please sign in again." });
    }

    const user = db.prepare("SELECT * FROM Users WHERE UserId = ?").get(session.UserId);
    if (!user || !["ADMIN", "USER"].includes(user.Role)) {
      return res.status(403).json({ message: "Account access is unavailable." });
    }
    if (!user.IsEnabled) {
      db.prepare("DELETE FROM RefreshSessions WHERE UserId = ?").run(user.UserId);
      return res.status(403).json({ message: "This account has been disabled. Contact an administrator." });
    }

    db.prepare("DELETE FROM RefreshSessions WHERE SessionId = ?").run(payload.sessionId);
    const rememberMe = Boolean(payload.rememberMe);
    setRefreshCookie(res, issueRefreshSession(user, rememberMe), rememberMe);
    return res.json({ token: issueAccessToken(user), user: mapUser(user) });
  } catch {
    return res.status(401).json({ message: "Session expired. Please sign in again." });
  }
});

router.post("/logout", (req, res) => {
  const refreshToken = readRefreshToken(req);
  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, config.jwtSecret);
      if (payload.type === "refresh" && payload.sessionId) {
        db.prepare("DELETE FROM RefreshSessions WHERE SessionId = ?").run(payload.sessionId);
      }
    } catch {
      // The expired token is still cleared from the browser below.
    }
  }
  res.clearCookie("refresh_session", { httpOnly: true, sameSite: config.nodeEnv === "production" ? "none" : "lax", secure: config.nodeEnv === "production", path: "/api/auth" });
  return res.status(204).send();
});

router.get("/me", authRequired, (req, res) => {
  const user = db.prepare("SELECT * FROM Users WHERE UserId = ?").get(req.user.userId);
  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }
  return res.json({ user: mapUser(user) });
});

router.put(
  "/settings",
  authRequired,
  upload.single("avatar"),
  validateAvatarDimensions,
  body("fullName").trim().isLength({ min: 2, max: 80 }).withMessage("Full name must be 2-80 characters."),
  body("displayName").trim().isLength({ min: 2, max: 40 }).withMessage("Display name must be 2-40 characters."),
  body("email").trim().isEmail().normalizeEmail().withMessage("Enter a valid email address."),
  body("mobileNumber").optional({ checkFalsy: true }).trim().matches(/^[0-9+() -]{7,20}$/).withMessage("Enter a valid mobile number."),
  body("preferences").optional().custom((value) => {
    try {
      JSON.parse(value);
      return true;
    } catch {
      throw new Error("Preferences are invalid.");
    }
  }),
  body("removeAvatar").optional().isBoolean().withMessage("removeAvatar must be true/false."),
  validateRequest,
  (req, res) => {
    const user = db.prepare("SELECT * FROM Users WHERE UserId = ?").get(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const avatarUrl = req.file
      ? `/uploads/${req.file.filename}`
      : req.body.removeAvatar === "true"
      ? null
      : user.AvatarUrl;

    try {
      db.prepare(
        "UPDATE Users SET FullName = ?, DisplayName = ?, Email = ?, AvatarUrl = ?, MobileNumber = ?, Preferences = ? WHERE UserId = ?"
      ).run(
        req.body.fullName,
        req.body.displayName,
        req.body.email,
        avatarUrl,
        req.body.mobileNumber || "",
        req.body.preferences || user.Preferences || "{}",
        user.UserId
      );
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) {
        return res.status(409).json({ message: "That email address is already in use." });
      }
      throw error;
    }

    const updated = db.prepare("SELECT * FROM Users WHERE UserId = ?").get(user.UserId);
    return res.json({ user: mapUser(updated) });
  }
);

router.put(
  "/password",
  authRequired,
  body("currentPassword").isLength({ min: 8 }).withMessage("Current password is required."),
  body("newPassword").isLength({ min: 10, max: 128 }).withMessage("New password must be 10-128 characters."),
  body("confirmPassword").custom((value, { req }) => value === req.body.newPassword).withMessage("Passwords do not match."),
  validateRequest,
  async (req, res) => {
    const user = db.prepare("SELECT * FROM Users WHERE UserId = ?").get(req.user.userId);
    if (!user || !(await bcrypt.compare(req.body.currentPassword, user.PasswordHash))) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    db.prepare("UPDATE Users SET PasswordHash = ? WHERE UserId = ?").run(passwordHash, user.UserId);
    return res.json({ message: "Password updated successfully." });
  }
);

export default router;
