import { db } from "./db.js";
import { nowIso } from "./utils.js";
import { recordProductAudit } from "./product-audit.js";

const inventorySelect = `
  SELECT i.InventoryId, i.ProductId, p.ProductName, p.Category, i.CurrentStock, i.AvailableStock,
    i.ReservedStock, i.Status, i.CreatedDate, i.UpdatedDate
  FROM Inventory i JOIN Products p ON p.ProductId = i.ProductId
`;

function statusFor(stock) {
  return stock === 0 ? "OUT_OF_STOCK" : stock <= 5 ? "LOW_STOCK" : "IN_STOCK";
}

export function ensureInventoryRecords() {
  const timestamp = nowIso();
  return db.prepare(`
    INSERT OR IGNORE INTO Inventory (ProductId, CurrentStock, AvailableStock, ReservedStock, Status, CreatedDate, UpdatedDate)
    SELECT ProductId, Quantity, Quantity, 0,
      CASE WHEN Quantity = 0 THEN 'OUT_OF_STOCK' WHEN Quantity <= 5 THEN 'LOW_STOCK' ELSE 'IN_STOCK' END,
      ?, ? FROM Products
  `).run(timestamp, timestamp);
}

export function syncInventoryForProduct(productId, stock, createdDate, updatedDate) {
  const status = statusFor(stock);
  db.prepare(`
    INSERT INTO Inventory (ProductId, CurrentStock, AvailableStock, ReservedStock, Status, CreatedDate, UpdatedDate)
    VALUES (?, ?, ?, 0, ?, ?, ?)
    ON CONFLICT(ProductId) DO UPDATE SET CurrentStock = excluded.CurrentStock, AvailableStock = excluded.AvailableStock, Status = excluded.Status, UpdatedDate = excluded.UpdatedDate
  `).run(productId, stock, stock, status, createdDate, updatedDate);
}

export function listInventory() {
  return db.prepare(`${inventorySelect} ORDER BY p.ProductName`).all();
}

export function getInventoryById(productId) {
  return db.prepare(`${inventorySelect} WHERE i.ProductId = ?`).get(productId);
}

export function listLowStock() {
  return db.prepare(`${inventorySelect} WHERE i.CurrentStock BETWEEN 1 AND 5 ORDER BY i.CurrentStock, p.ProductName`).all();
}

export function recordViewed(inventoryRows, adminUserId) {
  const audit = db.prepare("INSERT INTO InventoryAuditLog (InventoryId, ProductId, AdminUserId, Action, CreatedDate) VALUES (?, ?, ?, 'VIEWED', ?)");
  const timestamp = nowIso();
  for (const row of inventoryRows) audit.run(row.InventoryId, row.ProductId, adminUserId, timestamp);
}

export function updateStock(productId, stock, adminUserId, action = "UPDATED") {
  const timestamp = nowIso();
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = getInventoryById(productId);
    if (!existing) {
      db.exec("ROLLBACK");
      return null;
    }
    const status = statusFor(stock);
    db.prepare("UPDATE Inventory SET CurrentStock = ?, AvailableStock = ?, Status = ?, UpdatedDate = ? WHERE ProductId = ?").run(stock, stock, status, timestamp, productId);
    db.prepare("UPDATE Products SET Quantity = ?, UpdatedDate = ? WHERE ProductId = ?").run(stock, timestamp, productId);
    if (existing.CurrentStock !== stock) recordProductAudit({ productId, userId: adminUserId, action: "INVENTORY_CHANGED", oldValues: { quantity: existing.CurrentStock }, newValues: { quantity: stock } });
    db.prepare("INSERT INTO InventoryAuditLog (InventoryId, ProductId, AdminUserId, Action, OldStock, NewStock, CreatedDate) VALUES (?, ?, ?, ?, ?, ?, ?)").run(existing.InventoryId, productId, adminUserId, action, existing.CurrentStock, stock, timestamp);
    if (existing.Status !== status) db.prepare("INSERT INTO InventoryAuditLog (InventoryId, ProductId, AdminUserId, Action, OldStock, NewStock, CreatedDate) VALUES (?, ?, ?, 'STATUS_CHANGED', ?, ?, ?)").run(existing.InventoryId, productId, adminUserId, existing.CurrentStock, stock, timestamp);
    db.exec("COMMIT");
    return { ...getInventoryById(productId), oldStock: existing.CurrentStock, statusChanged: existing.Status !== status };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}