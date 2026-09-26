export function getCheckoutOrderNumber(idempotencyKey) {
  const reference = String(idempotencyKey || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (reference.length < 16) throw new Error("A valid checkout reference is required.");
  return `VSE-${reference.slice(0, 16)}`;
}

export function summarizeCheckoutProducts(items = []) {
  if (items.length === 1) {
    const item = items[0];
    return `${item.ProductName}${Number(item.Quantity) > 1 ? ` × ${item.Quantity}` : ""}`;
  }
  if (!items.length) return "No products";
  return `Items: ${items.length} Products · ${items[0].ProductName} + ${items.length - 1} More`;
}

export function buildUpiTransactionNote(orderNumber, items) {
  const productSummary = items.length === 1
    ? `Product ${summarizeCheckoutProducts(items)}`
    : summarizeCheckoutProducts(items);
  return `Order ${orderNumber}: ${productSummary}`.slice(0, 80);
}