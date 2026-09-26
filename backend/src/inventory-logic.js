export function calculateInventoryState(currentStock, reservedStock = 0) {
  const current = Number(currentStock);
  const reserved = Number(reservedStock);
  if (!Number.isInteger(current) || current < 0 || !Number.isInteger(reserved) || reserved < 0) {
    throw Object.assign(new Error("Inventory quantities must be non-negative integers."), { status: 400 });
  }
  if (reserved > current) {
    throw Object.assign(new Error(`Stock cannot be lower than the ${reserved} units reserved for checkout.`), { status: 409, code: "STOCK_BELOW_RESERVATIONS" });
  }
  const available = current - reserved;
  return {
    CurrentStock: current,
    ReservedStock: reserved,
    AvailableStock: available,
    Status: available === 0 ? "OUT_OF_STOCK" : available <= 5 ? "LOW_STOCK" : "IN_STOCK"
  };
}