import { db } from "./db.js";
import { nowIso } from "./utils.js";

export function getUserNotifications(userId) {
  return db.prepare("SELECT Notifications.*, Products.ProductName FROM Notifications LEFT JOIN Products ON Products.ProductId = Notifications.ProductId WHERE Notifications.UserId = ? ORDER BY datetime(Notifications.CreatedDate) DESC LIMIT 50").all(userId);
}

export function getUnreadCount(userId) {
  return db.prepare("SELECT COUNT(*) AS count FROM Notifications WHERE UserId = ? AND IsRead = 0").get(userId).count;
}

export function markAsRead(userId, notificationId) {
  return db.prepare("UPDATE Notifications SET IsRead = 1 WHERE NotificationId = ? AND UserId = ?").run(notificationId, userId);
}

export function markAllAsRead(userId) {
  return db.prepare("UPDATE Notifications SET IsRead = 1 WHERE UserId = ?").run(userId);
}

export function sendAvailabilityNotification(productId, productName) {
  const timestamp = nowIso();
  const subscriptions = db.prepare("SELECT UserId, SubscriptionId FROM NotificationSubscriptions WHERE ProductId = ? AND IsSent = 0 AND IsActive = 1").all(productId);
  const createNotification = db.prepare("INSERT INTO Notifications (UserId, ProductId, Type, Title, Message, CreatedDate) VALUES (?, ?, 'BACK_IN_STOCK', ?, ?, ?)");
  const markSent = db.prepare("UPDATE NotificationSubscriptions SET IsSent = 1, IsActive = 0, SentDate = ? WHERE SubscriptionId = ?");

  for (const subscription of subscriptions) {
    createNotification.run(subscription.UserId, productId, "Product Back In Stock", `Good news! ${productName} is now available.`, timestamp);
    markSent.run(timestamp, subscription.SubscriptionId);
  }
  return subscriptions.length;
}