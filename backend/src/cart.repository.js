import { db } from "./db.js";
import { nowIso } from "./utils.js";

const cartItemsQuery = `
  SELECT ci.CartItemId, ci.CartId, ci.ProductId, ci.Quantity, ci.UnitPrice, ci.CreatedDate, ci.UpdatedDate,
    p.ProductName, p.Category, p.ImageUrl, COALESCE(i.AvailableStock, p.Quantity) AS AvailableStock
  FROM CartItems ci
  JOIN Products p ON p.ProductId = ci.ProductId
  LEFT JOIN Inventory i ON i.ProductId = p.ProductId
`;

export function getOrCreateCart(userId) {
  let cart = db.prepare("SELECT * FROM Carts WHERE UserId = ?").get(userId);
  if (!cart) {
    const timestamp = nowIso();
    const result = db.prepare("INSERT INTO Carts (UserId, CreatedDate, UpdatedDate) VALUES (?, ?, ?)").run(userId, timestamp, timestamp);
    cart = db.prepare("SELECT * FROM Carts WHERE CartId = ?").get(result.lastInsertRowid);
  }
  return cart;
}

export function getCartItems(cartId) {
  return db.prepare(`${cartItemsQuery} WHERE ci.CartId = ? ORDER BY ci.CreatedDate`).all(cartId);
}

export function getCartItem(cartId, cartItemId) {
  return db.prepare(`${cartItemsQuery} WHERE ci.CartId = ? AND ci.CartItemId = ?`).get(cartId, cartItemId);
}

export function getProduct(productId) {
  return db.prepare("SELECT p.ProductId, p.ProductName, p.Price, p.IsActive, COALESCE(i.AvailableStock, p.Quantity) AS AvailableStock FROM Products p LEFT JOIN Inventory i ON i.ProductId = p.ProductId WHERE p.ProductId = ?").get(productId);
}

export function getCartItemByProduct(cartId, productId) {
  return db.prepare("SELECT * FROM CartItems WHERE CartId = ? AND ProductId = ?").get(cartId, productId);
}

export function saveItem(cartId, productId, quantity, unitPrice, action, userId, oldQuantity = null) {
  console.info(JSON.stringify({ level: "info", message: "Cart repository save started", cartId, productId, quantity, action, userId }));
  const timestamp = nowIso();
  const existing = getCartItemByProduct(cartId, productId);
  let cartItemId;
  if (existing) {
    db.prepare("UPDATE CartItems SET Quantity = ?, UnitPrice = ?, UpdatedDate = ? WHERE CartItemId = ?").run(quantity, unitPrice, timestamp, existing.CartItemId);
    cartItemId = existing.CartItemId;
  } else {
    const result = db.prepare("INSERT INTO CartItems (CartId, ProductId, Quantity, UnitPrice, CreatedDate, UpdatedDate) VALUES (?, ?, ?, ?, ?, ?)").run(cartId, productId, quantity, unitPrice, timestamp, timestamp);
    cartItemId = result.lastInsertRowid;
  }
  db.prepare("UPDATE Carts SET UpdatedDate = ? WHERE CartId = ?").run(timestamp, cartId);
  db.prepare("INSERT INTO CartAuditLog (CartId, CartItemId, UserId, ProductId, Action, OldQuantity, NewQuantity, CreatedDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(cartId, cartItemId, userId, productId, action, oldQuantity, quantity, timestamp);
  const savedItem = getCartItem(cartId, cartItemId);
  console.info(JSON.stringify({ level: "info", message: "Cart repository save completed", cartId, cartItemId, productId, quantity: savedItem?.Quantity ?? null }));
  return savedItem;
}

export function removeItem(cartId, cartItemId, userId) {
  const item = getCartItem(cartId, cartItemId);
  if (!item) return null;
  const timestamp = nowIso();
  db.prepare("DELETE FROM CartItems WHERE CartItemId = ? AND CartId = ?").run(cartItemId, cartId);
  db.prepare("UPDATE Carts SET UpdatedDate = ? WHERE CartId = ?").run(timestamp, cartId);
  db.prepare("INSERT INTO CartAuditLog (CartId, UserId, ProductId, Action, OldQuantity, NewQuantity, CreatedDate) VALUES (?, ?, ?, 'REMOVED', ?, 0, ?)").run(cartId, userId, item.ProductId, item.Quantity, timestamp);
  return item;
}

export function clearCart(cartId, userId) {
  const timestamp = nowIso();
  db.prepare("DELETE FROM CartItems WHERE CartId = ?").run(cartId);
  db.prepare("UPDATE Carts SET UpdatedDate = ? WHERE CartId = ?").run(timestamp, cartId);
  db.prepare("INSERT INTO CartAuditLog (CartId, UserId, Action, CreatedDate) VALUES (?, ?, 'CLEARED', ?)").run(cartId, userId, timestamp);
}