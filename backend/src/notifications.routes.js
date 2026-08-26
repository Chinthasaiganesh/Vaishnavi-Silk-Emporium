import { Router } from "express";
import { param } from "express-validator";
import { db } from "./db.js";
import { authRequired, validateRequest } from "./middleware.js";
import { nowIso } from "./utils.js";
import { getUnreadCount, getUserNotifications, markAllAsRead, markAsRead } from "./notification.service.js";

const router = Router();

router.post("/subscriptions/:productId", authRequired, param("productId").isInt({ min: 1 }), validateRequest, (req, res) => {
  const productId = Number(req.params.productId);
  const product = db.prepare("SELECT ProductId, Quantity, IsActive FROM Products WHERE ProductId = ?").get(productId);
  if (!product || !product.IsActive) return res.status(404).json({ message: "Product not found." });
  if (product.Quantity > 0) return res.status(400).json({ message: "This product is already available." });
  const existing = db.prepare("SELECT SubscriptionId, IsActive FROM NotificationSubscriptions WHERE UserId = ? AND ProductId = ? AND NotificationType = 'BACK_IN_STOCK'").get(req.user.userId, productId);
  if (existing?.IsActive) return res.status(409).json({ message: "You are already subscribed to this availability alert." });
  if (existing) db.prepare("UPDATE NotificationSubscriptions SET IsActive = 1, IsSent = 0, SentDate = NULL, CreatedDate = ? WHERE SubscriptionId = ?").run(nowIso(), existing.SubscriptionId);
  else db.prepare("INSERT INTO NotificationSubscriptions (UserId, ProductId, CreatedDate) VALUES (?, ?, ?)").run(req.user.userId, productId, nowIso());
  return res.status(201).json({ message: "We will notify you when this product is back in stock." });
});

router.get("/subscriptions/:productId", authRequired, param("productId").isInt({ min: 1 }), validateRequest, (req, res) => {
  const subscription = db.prepare("SELECT SubscriptionId FROM NotificationSubscriptions WHERE UserId = ? AND ProductId = ? AND IsSent = 0 AND IsActive = 1").get(req.user.userId, Number(req.params.productId));
  return res.json({ subscribed: Boolean(subscription) });
});

router.get("/", authRequired, (req, res) => {
  const notifications = getUserNotifications(req.user.userId);
  const unreadCount = getUnreadCount(req.user.userId);
  return res.json({ notifications: notifications.map((item) => ({ notificationId: item.NotificationId, productId: item.ProductId, productName: item.ProductName, title: item.Title, message: item.Message, isRead: Boolean(item.IsRead), createdDate: item.CreatedDate })), unreadCount });
});

router.put("/:notificationId/read", authRequired, param("notificationId").isInt({ min: 1 }), validateRequest, (req, res) => {
  markAsRead(req.user.userId, Number(req.params.notificationId));
  return res.status(204).send();
});

router.put("/read-all", authRequired, (req, res) => {
  markAllAsRead(req.user.userId);
  return res.status(204).send();
});

export default router;