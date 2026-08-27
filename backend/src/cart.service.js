import { clearCart, getCartItem, getCartItemByProduct, getCartItems, getOrCreateCart, getProduct, removeItem, saveItem } from "./cart.repository.js";

function assertQuantity(quantity) {
  if (!Number.isInteger(quantity) || quantity < 1) throw Object.assign(new Error("Quantity must be a positive integer."), { status: 400 });
}

function assertStock(quantity, availableStock) {
  if (availableStock < quantity) throw Object.assign(new Error(availableStock === 0 ? "Currently out of stock." : `Only ${availableStock} item${availableStock === 1 ? "" : "s"} available.`), { status: 409 });
}

export function calculateTotals(items) {
  const subtotal = items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  return { itemCount: items.reduce((total, item) => total + item.quantity, 0), subtotal, grandTotal: subtotal };
}

function mapCartItem(item) {
  return { cartItemId: item.CartItemId, productId: item.ProductId, productName: item.ProductName, category: item.Category, imageUrl: item.ImageUrl, quantity: item.Quantity, unitPrice: item.UnitPrice, availableStock: item.AvailableStock, subtotal: item.UnitPrice * item.Quantity, createdDate: item.CreatedDate, updatedDate: item.UpdatedDate };
}

export function getCart(userId) {
  const cart = getOrCreateCart(userId);
  const items = getCartItems(cart.CartId).map(mapCartItem);
  return { cartId: cart.CartId, items, totals: calculateTotals(items) };
}

export function addToCart(userId, productId, quantity, requestId) {
  console.info(JSON.stringify({ level: "info", message: "Cart add service hit", requestId, userId, productId, quantity }));
  assertQuantity(quantity);
  const cart = getOrCreateCart(userId);
  const product = getProduct(productId);
  console.info(JSON.stringify({ level: "info", message: "Cart product lookup completed", requestId, userId, productId, availableStock: product?.AvailableStock ?? null, productFound: Boolean(product) }));
  if (!product || !product.IsActive) throw Object.assign(new Error("Product is unavailable."), { status: 404 });
  const existing = getCartItemByProduct(cart.CartId, productId);
  const nextQuantity = (existing?.Quantity || 0) + quantity;
  assertStock(nextQuantity, product.AvailableStock);
  saveItem(cart.CartId, productId, nextQuantity, product.Price, existing ? "QUANTITY_UPDATED" : "ADDED", userId, existing?.Quantity || null);
  return getCart(userId);
}

export function updateQuantity(userId, cartItemId, quantity) {
  assertQuantity(quantity);
  const cart = getOrCreateCart(userId);
  const item = getCartItem(cart.CartId, cartItemId);
  if (!item) throw Object.assign(new Error("Cart item not found."), { status: 404 });
  assertStock(quantity, item.AvailableStock);
  saveItem(cart.CartId, item.ProductId, quantity, item.UnitPrice, "QUANTITY_UPDATED", userId, item.Quantity);
  return getCart(userId);
}

export function removeCartItem(userId, cartItemId) {
  const cart = getOrCreateCart(userId);
  if (!removeItem(cart.CartId, cartItemId, userId)) throw Object.assign(new Error("Cart item not found."), { status: 404 });
  return getCart(userId);
}

export function emptyCart(userId) {
  const cart = getOrCreateCart(userId);
  clearCart(cart.CartId, userId);
  return getCart(userId);
}