import { clearCart, getCartItem, getCartItemByProduct, getCartItems, getOrCreateCart, getProduct, removeItem, saveItem } from "./cart.repository.js";
import { stockUnavailableError } from "./utils.js";
import { transaction } from "./db.js";
import { nowIso } from "./utils.js";
import { getActiveReservation, releaseExpiredReservations, reservationView } from "./reservation.repository.js";

function assertQuantity(quantity) {
  if (!Number.isInteger(quantity) || quantity < 1) throw Object.assign(new Error("Quantity must be a positive integer."), { status: 400 });
}

function assertStock(quantity, availableStock, reservedStock = 0) {
  if (availableStock < quantity) throw stockUnavailableError(availableStock, reservedStock);
}

export function calculateTotals(items) {
  const subtotal = items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  const discount = items.reduce((total, item) => total + Math.max(0, item.originalPrice - item.unitPrice) * item.quantity, 0);
  const originalSubtotal = items.reduce((total, item) => total + item.originalPrice * item.quantity, 0);
  return { itemCount: items.reduce((total, item) => total + item.quantity, 0), originalSubtotal, discount, subtotal, grandTotal: subtotal };
}

async function assertCartIsUnlocked(tx, userId, cartId) {
  await tx.get("SELECT CartId FROM Carts WHERE CartId = ? AND UserId = ? FOR UPDATE", [cartId, userId]);
  const reservation = await tx.get("SELECT * FROM CheckoutReservations WHERE UserId = ? AND ReservationStatus = 'ACTIVE' AND ExpiresAt > ? ORDER BY ReservedAt DESC LIMIT 1 FOR UPDATE", [userId, nowIso()]);
  if (!reservation) return;
  const items = await tx.all("SELECT * FROM CheckoutReservationItems WHERE ReservationId = ? ORDER BY ReservationItemId", [reservation.ReservationId]);
  throw Object.assign(new Error("You already have an active payment transaction. Please complete it or cancel the payment session before changing your cart."), {
    status: 409,
    code: "ACTIVE_PAYMENT_SESSION",
    activePaymentSession: reservationView({ ...reservation, items })
  });
}

function mapCartItem(item) {
  let imageUrl = item.ImageUrl || "";
  try {
    const parsed = JSON.parse(imageUrl);
    imageUrl = Array.isArray(parsed) ? parsed.find(Boolean) || "" : parsed;
  } catch {
    // Legacy rows may store a plain path.
  }
  const originalPrice = Number(item.OriginalPrice ?? item.UnitPrice ?? 0);
  const unitPrice = Number(item.UnitPrice ?? originalPrice);
  const discountPercentage = unitPrice < originalPrice ? Math.round(((originalPrice - unitPrice) / originalPrice) * 100) : 0;
  const availableStock = Number(item.AvailableStock ?? 0);
  const reservedStock = Number(item.ReservedStock ?? 0);
  return { cartItemId: item.CartItemId, productId: item.ProductId, productName: item.ProductName, category: item.Category, imageUrl, quantity: item.Quantity, originalPrice, discountedPrice: unitPrice < originalPrice ? unitPrice : null, unitPrice, discountPercentage, availableStock, reservedStock, temporarilyReserved: availableStock <= 0 && reservedStock > 0, subtotal: unitPrice * item.Quantity, createdDate: item.CreatedDate, updatedDate: item.UpdatedDate };
}

export async function getCart(userId) {
  const activeReservation = await getActiveReservation(userId);
  const cart = await getOrCreateCart(userId);
  const items = (await getCartItems(cart.CartId)).map(mapCartItem);
  return { cartId: cart.CartId, items, totals: calculateTotals(items), activePaymentSession: activeReservation ? reservationView(activeReservation) : null };
}

export async function addToCart(userId, productId, quantity, requestId) {
  assertQuantity(quantity);
  await releaseExpiredReservations();
  const cart = await getOrCreateCart(userId);
  await transaction(async (tx) => {
    await assertCartIsUnlocked(tx, userId, cart.CartId);
    const product = await getProduct(productId, tx);
    if (!product || !product.IsActive) throw Object.assign(new Error("Product is unavailable."), { status: 404 });
    const existing = await getCartItemByProduct(cart.CartId, productId, tx);
    const nextQuantity = (existing?.Quantity || 0) + quantity;
    assertStock(nextQuantity, product.AvailableStock, product.ReservedStock);
    await saveItem(cart.CartId, productId, nextQuantity, product.Price, existing ? "QUANTITY_UPDATED" : "ADDED", userId, existing?.Quantity || null, tx);
  });
  return await getCart(userId);
}

export async function updateQuantity(userId, cartItemId, quantity) {
  assertQuantity(quantity);
  await releaseExpiredReservations();
  const cart = await getOrCreateCart(userId);
  await transaction(async (tx) => {
    await assertCartIsUnlocked(tx, userId, cart.CartId);
    const item = await getCartItem(cart.CartId, cartItemId, tx);
    if (!item) throw Object.assign(new Error("Cart item not found."), { status: 404 });
    assertStock(quantity, item.AvailableStock, item.ReservedStock);
    await saveItem(cart.CartId, item.ProductId, quantity, item.UnitPrice, "QUANTITY_UPDATED", userId, item.Quantity, tx);
  });
  return await getCart(userId);
}

export async function removeCartItem(userId, cartItemId) {
  await releaseExpiredReservations();
  const cart = await getOrCreateCart(userId);
  await transaction(async (tx) => {
    await assertCartIsUnlocked(tx, userId, cart.CartId);
    if (!(await removeItem(cart.CartId, cartItemId, userId, tx))) throw Object.assign(new Error("Cart item not found."), { status: 404 });
  });
  return await getCart(userId);
}

export async function emptyCart(userId) {
  await releaseExpiredReservations();
  const cart = await getOrCreateCart(userId);
  await transaction(async (tx) => {
    await assertCartIsUnlocked(tx, userId, cart.CartId);
    await clearCart(cart.CartId, userId, tx);
  });
  return await getCart(userId);
}