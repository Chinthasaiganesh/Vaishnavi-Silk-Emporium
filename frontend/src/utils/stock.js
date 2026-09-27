export function availabilityFromStock(snapshot = {}) {
  const availableQuantity = Math.max(0, Number(snapshot.availableStock) || 0);
  const reservedQuantity = Math.max(0, Number(snapshot.reservedStock) || 0);
  const currentStock = Number.isFinite(Number(snapshot.currentStock))
    ? Number(snapshot.currentStock)
    : availableQuantity + reservedQuantity;
  const temporarilyReserved = availableQuantity === 0 && reservedQuantity > 0;

  return {
    quantity: availableQuantity,
    currentStock,
    availableQuantity,
    reservedQuantity,
    temporarilyReserved,
    availabilityStatus: availableQuantity > 0
      ? "In Stock"
      : temporarilyReserved
        ? "Temporarily Unavailable"
        : "Out of Stock",
    availabilityMessage: availableQuantity > 0
      ? ""
      : temporarilyReserved
        ? "Another customer is completing checkout. Please try again shortly."
        : "This product is currently out of stock."
  };
}