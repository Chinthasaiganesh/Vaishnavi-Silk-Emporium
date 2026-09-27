import { sendAvailabilityNotification } from "./notification.service.js";
import { ensureInventoryRecords, getInventoryById, listInventory, listLowStock, recordViewed, updateStock } from "./inventory.repository.js";
import { logSafe } from "./safe-logger.js";

export async function initializeInventory() {
  return ensureInventoryRecords();
}

export async function getAllInventory(adminUserId) {
  const rows = await listInventory();
  await recordViewed(rows, adminUserId);
  return rows;
}

export async function getInventory(productId) {
  return getInventoryById(productId);
}

export async function getLowStockInventory() {
  return listLowStock();
}

export async function changeStock(productId, stock, adminUserId, action = "UPDATED") {
  const updated = await updateStock(productId, stock, adminUserId, action);
  if (updated?.oldAvailableStock === 0 && updated.AvailableStock > 0) {
    try {
      await sendAvailabilityNotification(productId, updated.ProductName);
    } catch (error) {
      logSafe("error", "availability_notification_failed", { diagnosticCode: error.code });
    }
  }
  return updated;
}