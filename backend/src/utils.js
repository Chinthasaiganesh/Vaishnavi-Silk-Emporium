export function nowIso() {
  return new Date().toISOString();
}

export function toBoolInt(value) {
  return value ? 1 : 0;
}

export function availabilityFromQty(quantity) {
  return quantity > 0 ? "In Stock" : "Out of Stock";
}
