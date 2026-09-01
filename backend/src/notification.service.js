import { db } from "./db.js";
import { nowIso } from "./utils.js";

export async function getUserNotifications(userId) {
  return await db.prepare("SELECT Notifications.*, Products.ProductName, Orders.OrderNumber FROM Notifications LEFT JOIN Products ON Products.ProductId = Notifications.ProductId LEFT JOIN Orders ON Orders.OrderId = Notifications.OrderId WHERE Notifications.UserId = ? ORDER BY datetime(Notifications.CreatedDate) DESC LIMIT 50").all(userId);
}

export async function getUnreadCount(userId) {
  return (await db.prepare("SELECT COUNT(*) AS count FROM Notifications WHERE UserId = ? AND IsRead = 0").get(userId)).count;
}

export async function markAsRead(userId, notificationId) {
  return await db.prepare("UPDATE Notifications SET IsRead = 1, ReadDate = COALESCE(ReadDate, ?) WHERE NotificationId = ? AND UserId = ?").run(nowIso(), notificationId, userId);
}

export async function markAllAsRead(userId) {
  return await db.prepare("UPDATE Notifications SET IsRead = 1, ReadDate = COALESCE(ReadDate, ?) WHERE UserId = ? AND IsRead = 0").run(nowIso(), userId);
}

export async function deleteReadNotification(userId, notificationId) {
  return await db.prepare("DELETE FROM Notifications WHERE NotificationId = ? AND UserId = ? AND IsRead = 1").run(notificationId, userId);
}

export async function deleteReadNotifications(userId) {
  return await db.prepare("DELETE FROM Notifications WHERE UserId = ? AND IsRead = 1").run(userId);
}

export async function getNotification(userId, notificationId) {
  return await db.prepare("SELECT NotificationId, IsRead FROM Notifications WHERE NotificationId = ? AND UserId = ?").get(notificationId, userId);
}

export async function sendAvailabilityNotification(productId, productName) {
  const timestamp = nowIso();
  const subscriptions = await db.prepare("SELECT UserId, SubscriptionId FROM NotificationSubscriptions WHERE ProductId = ? AND IsSent = 0 AND IsActive = 1").all(productId);
  const createNotification = await db.prepare("INSERT INTO Notifications (UserId, ProductId, Type, Title, Message, CreatedDate) VALUES (?, ?, 'BACK_IN_STOCK', ?, ?, ?)");
  const markSent = await db.prepare("UPDATE NotificationSubscriptions SET IsSent = 1, IsActive = 0, SentDate = ? WHERE SubscriptionId = ?");

  for (const subscription of subscriptions) {
    await createNotification.run(subscription.UserId, productId, "Product Back In Stock", `Good news! ${productName} is now available.`, timestamp);
    await markSent.run(timestamp, subscription.SubscriptionId);
  }
  return subscriptions.length;
}