import { db } from "./db.js";
import { getCart } from "./cart.service.js";
import { getDefaultAddress } from "./address.repository.js";
import { createOrder, createPaymentConflictOrder, getOrderByIdempotencyKey } from "./order.repository.js";

async function checkoutItems(userId) {
  const cart = await getCart(userId);
  console.info(JSON.stringify({ level: "info", message: "Cart contents loaded", userId, itemCount: cart.items.length, items: cart.items.map((item) => ({ productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, availableStock: item.availableStock })) }));
  return { cart, items: cart.items.map((item) => ({ ProductId: item.productId, ProductName: item.productName, ImageUrl: item.imageUrl, Price: Number(item.unitPrice), Quantity: item.quantity, AvailableStock: item.availableStock })) };
}

export async function getSummary(userId) {
  const { cart } = await checkoutItems(userId);
  return { items: cart.items, originalSubtotal: cart.totals.originalSubtotal, subtotal: cart.totals.subtotal, shipping: 0, discount: cart.totals.discount, grandTotal: cart.totals.grandTotal };
}

export async function validateCheckout(userId, addressId = null) {
  const { cart, items } = await checkoutItems(userId);
  if (!items.length) throw Object.assign(new Error("Cart is empty."), { status: 400, code: "CART_EMPTY" });
  const address = addressId ? await db.prepare("SELECT AddressId FROM Addresses WHERE AddressId = ? AND UserId = ?").get(addressId, userId) : await getDefaultAddress(userId);
  console.info(JSON.stringify({ level: "info", message: "Address validation result", userId, addressId, found: Boolean(address) }));
  if (!address) throw Object.assign(new Error("Address not found for this user."), { status: 404, code: "ADDRESS_NOT_FOUND" });
  for (const item of items) {
    const current = await db.prepare("SELECT ProductId, IsActive, COALESCE(DiscountedPrice, Price) AS Price, Quantity FROM Products WHERE ProductId = ?").get(item.ProductId);
    if (!current || !current.IsActive) throw Object.assign(new Error(`Product not found or inactive: ${item.ProductName}.`), { status: 404, code: "PRODUCT_NOT_FOUND" });
    if (current.Quantity < item.Quantity) throw Object.assign(new Error(`Insufficient stock available for ${item.ProductName}.`), { status: 409, code: "INSUFFICIENT_STOCK" });
    console.info(JSON.stringify({ level: "info", message: "Inventory validation result", userId, productId: item.ProductId, requestedQuantity: item.Quantity, productQuantity: current.Quantity, available: true }));
  }
  return { valid: true, addressId: address.AddressId, items, originalSubtotal: cart.totals.originalSubtotal, subtotal: cart.totals.subtotal, shipping: 0, discount: cart.totals.discount, grandTotal: cart.totals.grandTotal };
}

export async function placeOrder(userId, addressId, idempotencyKey, requestId, paymentMethod = 'UPI_MANUAL', paymentReference = null, paymentScreenshotUrl = null) {
  console.info(JSON.stringify({ level: "info", message: "Order service entry", requestId, userId, addressId, paymentMethod, paymentReferencePresent: Boolean(paymentReference) }));
  const existingOrder = await getOrderByIdempotencyKey(userId, idempotencyKey);
  if (existingOrder) return existingOrder;
  let checked;
  try {
    checked = await validateCheckout(userId, addressId);
  } catch (error) {
    if (error.code !== "INSUFFICIENT_STOCK" || !paymentReference || paymentMethod !== "UPI_MANUAL") throw error;
    const { cart, items } = await checkoutItems(userId);
    const address = await db.prepare("SELECT AddressId FROM Addresses WHERE AddressId = ? AND UserId = ?").get(addressId, userId);
    if (!address || !items.length) throw error;
    const orderItems = items.map((item) => ({ ...item, Price: Number(item.Price), OriginalPrice: Number(item.Price), DiscountedPrice: Number(item.Price), SavingsAmount: 0, DiscountPercentage: 0 }));
    const subtotal = orderItems.reduce((sum, item) => sum + item.Price * item.Quantity, 0);
    return await createPaymentConflictOrder({ userId, addressId: address.AddressId, idempotencyKey, items: orderItems, subtotal, shipping: 0, discount: 0, grandTotal: subtotal, paymentMethod, paymentReference, paymentScreenshotUrl, reason: "Payment received after inventory was purchased by another customer." });
  }
  console.info(JSON.stringify({ level: "info", message: "Order validation completed", requestId, userId, addressId, itemCount: checked.items.length, subtotal: checked.subtotal }));
  const orderItems = [];
  for (const item of checked.items) {
    const product = await db.prepare("SELECT ProductId, ProductName, Price AS OriginalPrice, DiscountedPrice, COALESCE(DiscountedPrice, Price) AS Price, Quantity, IsActive FROM Products WHERE ProductId = ?").get(item.ProductId);
    if (!product || !product.IsActive || product.Quantity < item.Quantity) throw Object.assign(new Error("Insufficient inventory available."), { status: 409 });
    const originalPrice = Number(product.OriginalPrice);
    const discountedPrice = Number(product.Price);
    const savingsAmount = Math.max(0, originalPrice - discountedPrice);
    const discountPercentage = originalPrice > 0 ? Math.round((savingsAmount / originalPrice) * 100) : 0;
    orderItems.push({ ...item, ProductName: product.ProductName, ImageUrl: item.ImageUrl, Price: discountedPrice, OriginalPrice: originalPrice, DiscountedPrice: discountedPrice, SavingsAmount: savingsAmount, DiscountPercentage: discountPercentage });
  }
  const subtotal = orderItems.reduce((sum, item) => sum + item.Price * item.Quantity, 0);
  const savings = orderItems.reduce((sum, item) => sum + item.SavingsAmount * item.Quantity, 0);
  try {
    return await createOrder({ userId, addressId: checked.addressId, idempotencyKey, requestId, items: orderItems, subtotal, shipping: 0, discount: savings, grandTotal: subtotal, paymentMethod, paymentReference, paymentScreenshotUrl });
  } catch (error) {
    if (error.code !== "INSUFFICIENT_STOCK" || !paymentReference || paymentMethod !== "UPI_MANUAL") throw error;
    return await createPaymentConflictOrder({ userId, addressId: checked.addressId, idempotencyKey, items: orderItems, subtotal, shipping: 0, discount: savings, grandTotal: subtotal, paymentMethod, paymentReference, paymentScreenshotUrl, reason: "Payment received after inventory was purchased by another customer." });
  }
}
