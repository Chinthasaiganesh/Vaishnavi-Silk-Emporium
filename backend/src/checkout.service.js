import { db } from "./db.js";
import { getCart } from "./cart.service.js";
import { getDefaultAddress } from "./address.repository.js";
import { createOrder, getOrderByIdempotencyKey } from "./order.repository.js";

function checkoutItems(userId) {
  const cart = getCart(userId);
  return { cart, items: cart.items.map((item) => ({ ProductId: item.productId, ProductName: item.productName, Price: Number(item.unitPrice), Quantity: item.quantity, AvailableStock: item.availableStock })) };
}

export function getSummary(userId) {
  const { cart } = checkoutItems(userId);
  return { items: cart.items, subtotal: cart.totals.subtotal, shipping: 0, discount: 0, grandTotal: cart.totals.subtotal };
}

export function validateCheckout(userId, addressId = null) {
  const { cart, items } = checkoutItems(userId);
  if (!items.length) throw Object.assign(new Error("Cart is empty."), { status: 400 });
  const address = addressId ? db.prepare("SELECT AddressId FROM Addresses WHERE AddressId = ? AND UserId = ?").get(addressId, userId) : getDefaultAddress(userId);
  if (!address) throw Object.assign(new Error("Address required."), { status: 400 });
  for (const item of items) {
    const current = db.prepare("SELECT ProductId, IsActive, Price, Quantity FROM Products WHERE ProductId = ?").get(item.ProductId);
    if (!current || !current.IsActive) throw Object.assign(new Error("Product unavailable."), { status: 409 });
    if (current.Quantity < item.Quantity) throw Object.assign(new Error(`Insufficient inventory available for ${item.ProductName}.`), { status: 409 });
  }
  return { valid: true, addressId: address.AddressId, items, subtotal: cart.totals.subtotal, shipping: 0, discount: 0, grandTotal: cart.totals.subtotal };
}

export function placeOrder(userId, addressId, idempotencyKey, requestId) {
  console.info(JSON.stringify({ level: "info", message: "Entered Order Service", requestId, userId, addressId }));
  const existingOrder = getOrderByIdempotencyKey(userId, idempotencyKey);
  if (existingOrder) return existingOrder;
  const checked = validateCheckout(userId, addressId);
  console.info(JSON.stringify({ level: "info", message: "Order validation completed", requestId, userId, addressId, itemCount: checked.items.length, subtotal: checked.subtotal }));
  const orderItems = checked.items.map((item) => {
    const product = db.prepare("SELECT ProductId, ProductName, Price, Quantity, IsActive FROM Products WHERE ProductId = ?").get(item.ProductId);
    if (!product || !product.IsActive || product.Quantity < item.Quantity) throw Object.assign(new Error("Insufficient inventory available."), { status: 409 });
    return { ...item, ProductName: product.ProductName, Price: Number(product.Price) };
  });
  return createOrder({ userId, addressId: checked.addressId, idempotencyKey, requestId, items: orderItems, subtotal: orderItems.reduce((sum, item) => sum + item.Price * item.Quantity, 0), shipping: 0, discount: 0, grandTotal: orderItems.reduce((sum, item) => sum + item.Price * item.Quantity, 0) });
}
