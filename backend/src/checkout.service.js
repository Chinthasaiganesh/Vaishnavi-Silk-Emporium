import { db } from "./db.js";
import { getCart } from "./cart.service.js";
import { getDefaultAddress } from "./address.repository.js";
import { createOrder, getOrderByIdempotencyKey } from "./order.repository.js";

async function checkoutItems(userId) {
  const cart = await getCart(userId);
  return { cart, items: cart.items.map((item) => ({ ProductId: item.productId, ProductName: item.productName, Price: Number(item.unitPrice), Quantity: item.quantity, AvailableStock: item.availableStock })) };
}

export async function getSummary(userId) {
  const { cart } = await checkoutItems(userId);
  return { items: cart.items, subtotal: cart.totals.subtotal, shipping: 0, discount: 0, grandTotal: cart.totals.subtotal };
}

export async function validateCheckout(userId, addressId = null) {
  const { cart, items } = await checkoutItems(userId);
  if (!items.length) throw Object.assign(new Error("Cart is empty."), { status: 400 });
  const address = addressId ? await db.prepare("SELECT AddressId FROM Addresses WHERE AddressId = ? AND UserId = ?").get(addressId, userId) : await getDefaultAddress(userId);
  if (!address) throw Object.assign(new Error("Address required."), { status: 400 });
  for (const item of items) {
    const current = await db.prepare("SELECT ProductId, IsActive, Price, Quantity FROM Products WHERE ProductId = ?").get(item.ProductId);
    if (!current || !current.IsActive) throw Object.assign(new Error("Product unavailable."), { status: 409 });
    if (current.Quantity < item.Quantity) throw Object.assign(new Error(`Insufficient inventory available for ${item.ProductName}.`), { status: 409 });
  }
  return { valid: true, addressId: address.AddressId, items, subtotal: cart.totals.subtotal, shipping: 0, discount: 0, grandTotal: cart.totals.subtotal };
}

export async function placeOrder(userId, addressId, idempotencyKey, requestId) {
  console.info(JSON.stringify({ level: "info", message: "Entered Order Service", requestId, userId, addressId }));
  const existingOrder = await getOrderByIdempotencyKey(userId, idempotencyKey);
  if (existingOrder) return existingOrder;
  const checked = await validateCheckout(userId, addressId);
  console.info(JSON.stringify({ level: "info", message: "Order validation completed", requestId, userId, addressId, itemCount: checked.items.length, subtotal: checked.subtotal }));
  const orderItems = [];
  for (const item of checked.items) {
    const product = await db.prepare("SELECT ProductId, ProductName, Price, Quantity, IsActive FROM Products WHERE ProductId = ?").get(item.ProductId);
    if (!product || !product.IsActive || product.Quantity < item.Quantity) throw Object.assign(new Error("Insufficient inventory available."), { status: 409 });
    orderItems.push({ ...item, ProductName: product.ProductName, Price: Number(product.Price) });
  }
  return await createOrder({ userId, addressId: checked.addressId, idempotencyKey, requestId, items: orderItems, subtotal: orderItems.reduce((sum, item) => sum + item.Price * item.Quantity, 0), shipping: 0, discount: 0, grandTotal: orderItems.reduce((sum, item) => sum + item.Price * item.Quantity, 0) });
}
