export function nowIso() {
  return new Date().toISOString();
}

export function toBoolInt(value) {
  return value ? 1 : 0;
}

export function availabilityFromQty(quantity) {
  return quantity > 0 ? "In Stock" : "Out of Stock";
}

export const TEMPORARILY_RESERVED_MESSAGE = "This item is temporarily unavailable because another customer is currently completing checkout. Please try again in a few minutes.";

export function stockUnavailableError(availableStock, reservedStock, productName) {
  const available = Math.max(0, Number(availableStock) || 0);
  const reserved = Math.max(0, Number(reservedStock) || 0);
  const current = available + reserved;
  const inventory = { availableStock: available, reservedStock: reserved, currentStock: current };
  if (available <= 0 && reserved > 0) return Object.assign(new Error(TEMPORARILY_RESERVED_MESSAGE), { status: 409, code: "TEMPORARILY_RESERVED", ...inventory });
  const label = productName ? ` for ${productName}` : "";
  const message = available <= 0 ? `Currently out of stock${label}.` : `Only ${available} item${available === 1 ? "" : "s"} available${label}.`;
  return Object.assign(new Error(message), { status: 409, code: "INSUFFICIENT_STOCK", ...inventory });
}
