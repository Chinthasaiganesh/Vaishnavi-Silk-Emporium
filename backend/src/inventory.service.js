import { sendAvailabilityNotification } from "./notification.service.js";
import { ensureInventoryRecords, getInventoryById, listInventory, listLowStock, recordViewed, syncInventoryForProduct, updateStock } from "./inventory.repository.js";

export async function initializeInventory() {
  return ensureInventoryRecords();
}

export async function synchronizeProductInventory(product) {
  return syncInventoryForProduct(product.ProductId, product.Quantity, product.CreatedDate, product.UpdatedDate);
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
  if (updated?.oldStock === 0 && stock > 0) {
    try {
      await sendAvailabilityNotification(productId, updated.ProductName);
    } catch (error) {
      console.error(JSON.stringify({ level: "error", message: "Back-in-stock notification failed", productId, error: error.message, stack: error.stack }));
    }
  }
  return updated;
}