import { db } from "./db.js";
import { getCart } from "./cart.service.js";
import { getDefaultAddress } from "./address.repository.js";
import { stockUnavailableError } from "./utils.js";
import { createOrder, createOrderFromReservation, createPaymentConflictOrder, getOrderByIdempotencyKey } from "./order.repository.js";

async function checkoutItems(userId) {
  const cart = await getCart(userId);
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
  if (!address) throw Object.assign(new Error("Address not found for this user."), { status: 404, code: "ADDRESS_NOT_FOUND" });
  for (const item of items) {
    const current = await db.prepare("SELECT p.ProductId, p.IsActive, COALESCE(p.DiscountedPrice, p.Price) AS Price, COALESCE(i.AvailableStock, 0) AS AvailableStock, COALESCE(i.ReservedStock, 0) AS ReservedStock FROM Products p LEFT JOIN Inventory i ON i.ProductId = p.ProductId WHERE p.ProductId = ?").get(item.ProductId);
    if (!current || !current.IsActive) throw Object.assign(new Error(`Product not found or inactive: ${item.ProductName}.`), { status: 404, code: "PRODUCT_NOT_FOUND" });
    if (current.AvailableStock < item.Quantity) throw stockUnavailableError(current.AvailableStock, current.ReservedStock, item.ProductName);
  }
  return { valid: true, addressId: address.AddressId, items, originalSubtotal: cart.totals.originalSubtotal, subtotal: cart.totals.subtotal, shipping: 0, discount: cart.totals.discount, grandTotal: cart.totals.grandTotal };
}

export async function placeOrder(userId, addressId, idempotencyKey, requestId, paymentMethod = 'UPI_MANUAL', paymentReference = null, paymentScreenshotKey = null, reservationId = null) {
  const existingOrder = await getOrderByIdempotencyKey(userId, idempotencyKey);
  if (existingOrder) return existingOrder;
    if (reservationId) return await createOrderFromReservation({ userId, reservationId, idempotencyKey, requestId, paymentMethod, paymentReference, paymentScreenshotKey });
  let checked;
  try {
    checked = await validateCheckout(userId, addressId);
  } catch (error) {
    if (!["INSUFFICIENT_STOCK", "TEMPORARILY_RESERVED"].includes(error.code) || !paymentReference || paymentMethod !== "UPI_MANUAL") throw error;
    const { cart, items } = await checkoutItems(userId);
    const address = await db.prepare("SELECT AddressId FROM Addresses WHERE AddressId = ? AND UserId = ?").get(addressId, userId);
    if (!address || !items.length) throw error;
    const orderItems = items.map((item) => ({ ...item, Price: Number(item.Price), OriginalPrice: Number(item.Price), DiscountedPrice: Number(item.Price), SavingsAmount: 0, DiscountPercentage: 0 }));
    const subtotal = orderItems.reduce((sum, item) => sum + item.Price * item.Quantity, 0);
    return await createPaymentConflictOrder({ userId, addressId: address.AddressId, idempotencyKey, items: orderItems, subtotal, shipping: 0, discount: 0, grandTotal: subtotal, paymentMethod, paymentReference, paymentScreenshotKey, reason: "Payment received after inventory was purchased by another customer." });
  }
  const orderItems = [];
  for (const item of checked.items) {
    const product = await db.prepare("SELECT p.ProductId, p.ProductName, p.Price AS OriginalPrice, p.DiscountedPrice, COALESCE(p.DiscountedPrice, p.Price) AS Price, COALESCE(i.CurrentStock, 0) AS CurrentStock, COALESCE(i.AvailableStock, 0) AS AvailableStock, p.IsActive FROM Products p LEFT JOIN Inventory i ON i.ProductId = p.ProductId WHERE p.ProductId = ?").get(item.ProductId);
    if (!product || !product.IsActive || product.AvailableStock < item.Quantity) throw Object.assign(new Error("Insufficient inventory available."), { status: 409, code: "INSUFFICIENT_STOCK" });
    const originalPrice = Number(product.OriginalPrice);
    const discountedPrice = Number(product.Price);
    const savingsAmount = Math.max(0, originalPrice - discountedPrice);
    const discountPercentage = originalPrice > 0 ? Math.round((savingsAmount / originalPrice) * 100) : 0;
    orderItems.push({ ...item, ProductName: product.ProductName, ImageUrl: item.ImageUrl, Price: discountedPrice, OriginalPrice: originalPrice, DiscountedPrice: discountedPrice, SavingsAmount: savingsAmount, DiscountPercentage: discountPercentage });
  }
  const subtotal = orderItems.reduce((sum, item) => sum + item.Price * item.Quantity, 0);
  const savings = orderItems.reduce((sum, item) => sum + item.SavingsAmount * item.Quantity, 0);
  try {
    return await createOrder({ userId, addressId: checked.addressId, idempotencyKey, requestId, items: orderItems, subtotal, shipping: 0, discount: savings, grandTotal: subtotal, paymentMethod, paymentReference, paymentScreenshotKey });
  } catch (error) {
    if (!["INSUFFICIENT_STOCK", "TEMPORARILY_RESERVED"].includes(error.code) || !paymentReference || paymentMethod !== "UPI_MANUAL") throw error;
    return await createPaymentConflictOrder({ userId, addressId: checked.addressId, idempotencyKey, items: orderItems, subtotal, shipping: 0, discount: savings, grandTotal: subtotal, paymentMethod, paymentReference, paymentScreenshotKey, reason: "Payment received after inventory was purchased by another customer." });
  }
}
