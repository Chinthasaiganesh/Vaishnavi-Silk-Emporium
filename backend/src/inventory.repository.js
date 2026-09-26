import { db, transaction } from "./db.js";
import { nowIso } from "./utils.js";
import { recordProductAudit } from "./product-audit.js";
import { calculateInventoryState } from "./inventory-logic.js";

const inventorySelect = `
  SELECT i.InventoryId, i.ProductId, p.ProductName, p.Category, i.CurrentStock, i.AvailableStock,
    i.ReservedStock, i.Status, i.CreatedDate, i.UpdatedDate
  FROM Inventory i JOIN Products p ON p.ProductId = i.ProductId
`;

export async function ensureInventoryRecords() {
  const timestamp = nowIso();
  return await transaction(async (tx) => {
    const migration = await tx.run('INSERT INTO "InventoryMigrations" ("MigrationKey", "AppliedAt") VALUES (?, ?) ON CONFLICT("MigrationKey") DO NOTHING', ["inventory-from-legacy-product-quantity-v1", timestamp]);
    if (migration.changes) {
      await tx.run(`
        INSERT INTO Inventory (ProductId, CurrentStock, AvailableStock, ReservedStock, Status, CreatedDate, UpdatedDate)
        SELECT ProductId, Quantity, Quantity, 0,
          CASE WHEN Quantity = 0 THEN 'OUT_OF_STOCK' WHEN Quantity <= 5 THEN 'LOW_STOCK' ELSE 'IN_STOCK' END,
          CreatedDate, UpdatedDate FROM Products
        ON CONFLICT(ProductId) DO NOTHING
      `);
    }
    await tx.run("UPDATE Products p SET Quantity = i.CurrentStock FROM Inventory i WHERE i.ProductId = p.ProductId AND p.Quantity <> i.CurrentStock");
    return migration;
  });
}

export async function updateStockInTransaction(tx, productId, stock, adminUserId, action, timestamp) {
  let existing = await tx.get("SELECT * FROM Inventory WHERE ProductId = ? FOR UPDATE", [productId]);
  if (!existing) throw Object.assign(new Error("Inventory record is missing. Reconcile inventory before updating stock."), { status: 409, code: "INVENTORY_MISSING" });

  const next = calculateInventoryState(stock, existing.ReservedStock);
  await tx.run("UPDATE Inventory SET CurrentStock = ?, AvailableStock = ?, Status = ?, UpdatedDate = ? WHERE ProductId = ?", [next.CurrentStock, next.AvailableStock, next.Status, timestamp, productId]);
  await tx.run("UPDATE Products SET Quantity = ?, UpdatedDate = ? WHERE ProductId = ?", [next.CurrentStock, timestamp, productId]);
  await tx.run("INSERT INTO InventoryAuditLog (InventoryId, ProductId, AdminUserId, Action, OldStock, NewStock, CreatedDate) VALUES (?, ?, ?, ?, ?, ?, ?)", [existing.InventoryId, productId, adminUserId, action, existing.CurrentStock, next.CurrentStock, timestamp]);
  if (existing.Status !== next.Status) {
    await tx.run("INSERT INTO InventoryAuditLog (InventoryId, ProductId, AdminUserId, Action, OldStock, NewStock, CreatedDate) VALUES (?, ?, ?, 'STATUS_CHANGED', ?, ?, ?)", [existing.InventoryId, productId, adminUserId, existing.CurrentStock, next.CurrentStock, timestamp]);
  }
  return { ...next, InventoryId: existing.InventoryId, oldStock: existing.CurrentStock, oldAvailableStock: existing.AvailableStock, statusChanged: existing.Status !== next.Status };
}

export async function listInventory() {
  return await db.prepare(`${inventorySelect} ORDER BY p.ProductName`).all();
}

export async function getInventoryById(productId) {
  return await db.prepare(`${inventorySelect} WHERE i.ProductId = ?`).get(productId);
}

export async function listLowStock() {
  return await db.prepare(`${inventorySelect} WHERE i.AvailableStock BETWEEN 1 AND 5 ORDER BY i.AvailableStock, p.ProductName`).all();
}

export async function recordViewed(inventoryRows, adminUserId) {
  const audit = await db.prepare("INSERT INTO InventoryAuditLog (InventoryId, ProductId, AdminUserId, Action, CreatedDate) VALUES (?, ?, ?, 'VIEWED', ?)");
  const timestamp = nowIso();
  for (const row of inventoryRows) await audit.run(row.InventoryId, row.ProductId, adminUserId, timestamp);
}

export async function updateStock(productId, stock, adminUserId, action = "UPDATED") {
  const timestamp = nowIso();
  const updated = await transaction((tx) => updateStockInTransaction(tx, productId, stock, adminUserId, action, timestamp));
  if (!updated) return null;
  if (Number(updated.oldStock) !== Number(updated.CurrentStock)) await recordProductAudit({ productId, userId: adminUserId, action: "INVENTORY_CHANGED", oldValues: { quantity: updated.oldStock }, newValues: { quantity: updated.CurrentStock } });
  return { ...(await getInventoryById(productId)), oldStock: updated.oldStock, oldAvailableStock: updated.oldAvailableStock, statusChanged: updated.statusChanged };
}