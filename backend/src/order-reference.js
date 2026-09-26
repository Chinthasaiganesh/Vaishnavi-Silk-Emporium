export function orderNumberFromIdempotencyKey(idempotencyKey) {
  const reference = String(idempotencyKey || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (reference.length < 16) throw new Error("A valid idempotency key is required to create an order number.");
  return `VSE-${reference.slice(0, 16)}`;
}