import { sendAvailabilityNotification } from "./notification.service.js";
import { ensureInventoryRecords, getInventoryById, listInventory, listLowStock, recordViewed, syncInventoryForProduct, updateStock } from "./inventory.repository.js";

export function initializeInventory() {
  return ensureInventoryRecords();
}

export function synchronizeProductInventory(product) {
  return syncInventoryForProduct(product.ProductId, product.Quantity, product.CreatedDate, product.UpdatedDate);
}

export function getAllInventory(adminUserId) {
  const rows = listInventory();
  recordViewed(rows, adminUserId);
  return rows;
}

export function getInventory(productId) {
  return getInventoryById(productId);
}

export function getLowStockInventory() {
  return listLowStock();
}

export function changeStock(productId, stock, adminUserId, action = "UPDATED") {
  const updated = updateStock(productId, stock, adminUserId, action);
  if (updated?.oldStock === 0 && stock > 0) {
    try {
      sendAvailabilityNotification(productId, updated.ProductName);
    } catch (error) {
      console.error(JSON.stringify({ level: "error", message: "Back-in-stock notification failed", productId, error: error.message, stack: error.stack }));
    }
  }
  return updated;
}