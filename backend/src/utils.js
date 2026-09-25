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
  if (availableStock <= 0 && reservedStock > 0) return Object.assign(new Error(TEMPORARILY_RESERVED_MESSAGE), { status: 409, code: "TEMPORARILY_RESERVED" });
  const label = productName ? ` for ${productName}` : "";
  const message = availableStock <= 0 ? `Currently out of stock${label}.` : `Only ${availableStock} item${availableStock === 1 ? "" : "s"} available${label}.`;
  return Object.assign(new Error(message), { status: 409, code: "INSUFFICIENT_STOCK" });
}
