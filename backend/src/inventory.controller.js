import { changeStock, getAllInventory, getInventory, getLowStockInventory } from "./inventory.service.js";

function mapInventory(row) {
  return {
    inventoryId: row.InventoryId,
    productId: row.ProductId,
    productName: row.ProductName,
    category: row.Category,
    currentStock: row.CurrentStock,
    quantity: row.CurrentStock,
    availableStock: row.AvailableStock,
    reservedStock: row.ReservedStock,
    status: row.Status,
    availabilityStatus: row.Status === "OUT_OF_STOCK" ? "Out of Stock" : "In Stock",
    createdDate: row.CreatedDate,
    updatedDate: row.UpdatedDate
  };
}

export function list(req, res) {
  const records = getAllInventory(req.user.userId);
  return res.json({ products: records.map(mapInventory) });
}

export function details(req, res) {
  const record = getInventory(Number(req.params.id));
  if (!record) return res.status(404).json({ success: false, message: "Inventory record not found." });
  return res.json({ inventory: mapInventory(record) });
}

export function lowStock(req, res) {
  return res.json({ inventory: getLowStockInventory().map(mapInventory) });
}

export function update(req, res, action = "UPDATED") {
  if (typeof action !== "string") action = "UPDATED";
  const productId = Number(req.params.id || req.body.productId);
  const record = changeStock(productId, Number(req.body.stock), req.user.userId, action);
  if (!record) return res.status(404).json({ success: false, message: "Inventory record not found." });
  return res.json({ success: true, message: action === "RESTOCKED" ? "Inventory restocked successfully." : "Inventory updated successfully.", inventory: mapInventory(record) });
}