import { db } from "./db.js";
import { nowIso } from "./utils.js";

const cartItemsQuery = `
  SELECT ci.CartItemId, ci.CartId, ci.ProductId, ci.Quantity, ci.UnitPrice, ci.CreatedDate, ci.UpdatedDate,
    p.ProductName, p.Category, p.ImageUrl, COALESCE(i.AvailableStock, p.Quantity) AS AvailableStock
  FROM CartItems ci
  JOIN Products p ON p.ProductId = ci.ProductId
  LEFT JOIN Inventory i ON i.ProductId = p.ProductId
`;

export async function getOrCreateCart(userId) {
  let cart = await db.prepare("SELECT * FROM Carts WHERE UserId = ?").get(userId);
  if (!cart) {
    const timestamp = nowIso();
    const result = await db.prepare("INSERT INTO Carts (UserId, CreatedDate, UpdatedDate) VALUES (?, ?, ?)").run(userId, timestamp, timestamp);
    cart = await db.prepare("SELECT * FROM Carts WHERE CartId = ?").get(result.lastInsertRowid);
  }
  return cart;
}

export async function getCartItems(cartId) {
  return await db.prepare(`${cartItemsQuery} WHERE ci.CartId = ? ORDER BY ci.CreatedDate`).all(cartId);
}

export async function getCartItem(cartId, cartItemId) {
  return await db.prepare(`${cartItemsQuery} WHERE ci.CartId = ? AND ci.CartItemId = ?`).get(cartId, cartItemId);
}

export async function getProduct(productId) {
  return await db.prepare("SELECT p.ProductId, p.ProductName, p.Price, p.IsActive, COALESCE(i.AvailableStock, p.Quantity) AS AvailableStock FROM Products p LEFT JOIN Inventory i ON i.ProductId = p.ProductId WHERE p.ProductId = ?").get(productId);
}

export async function getCartItemByProduct(cartId, productId) {
  return await db.prepare("SELECT * FROM CartItems WHERE CartId = ? AND ProductId = ?").get(cartId, productId);
}

export async function saveItem(cartId, productId, quantity, unitPrice, action, userId, oldQuantity = null) {
  console.info(JSON.stringify({ level: "info", message: "Cart repository save started", cartId, productId, quantity, action, userId }));
  const timestamp = nowIso();
  const existing = await getCartItemByProduct(cartId, productId);
  let cartItemId;
  if (existing) {
    await db.prepare("UPDATE CartItems SET Quantity = ?, UnitPrice = ?, UpdatedDate = ? WHERE CartItemId = ?").run(quantity, unitPrice, timestamp, existing.CartItemId);
    cartItemId = existing.CartItemId;
  } else {
    const result = await db.prepare("INSERT INTO CartItems (CartId, ProductId, Quantity, UnitPrice, CreatedDate, UpdatedDate) VALUES (?, ?, ?, ?, ?, ?)").run(cartId, productId, quantity, unitPrice, timestamp, timestamp);
    cartItemId = result.lastInsertRowid;
  }
  await db.prepare("UPDATE Carts SET UpdatedDate = ? WHERE CartId = ?").run(timestamp, cartId);
  await db.prepare("INSERT INTO CartAuditLog (CartId, CartItemId, UserId, ProductId, Action, OldQuantity, NewQuantity, CreatedDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(cartId, cartItemId, userId, productId, action, oldQuantity, quantity, timestamp);
  const savedItem = await getCartItem(cartId, cartItemId);
  console.info(JSON.stringify({ level: "info", message: "Cart repository save completed", cartId, cartItemId, productId, quantity: savedItem?.Quantity ?? null }));
  return savedItem;
}

export async function removeItem(cartId, cartItemId, userId) {
  const item = await getCartItem(cartId, cartItemId);
  if (!item) return null;
  const timestamp = nowIso();
  await db.prepare("DELETE FROM CartItems WHERE CartItemId = ? AND CartId = ?").run(cartItemId, cartId);
  await db.prepare("UPDATE Carts SET UpdatedDate = ? WHERE CartId = ?").run(timestamp, cartId);
  await db.prepare("INSERT INTO CartAuditLog (CartId, UserId, ProductId, Action, OldQuantity, NewQuantity, CreatedDate) VALUES (?, ?, ?, 'REMOVED', ?, 0, ?)").run(cartId, userId, item.ProductId, item.Quantity, timestamp);
  return item;
}

export async function clearCart(cartId, userId) {
  const timestamp = nowIso();
  await db.prepare("DELETE FROM CartItems WHERE CartId = ?").run(cartId);
  await db.prepare("UPDATE Carts SET UpdatedDate = ? WHERE CartId = ?").run(timestamp, cartId);
  await db.prepare("INSERT INTO CartAuditLog (CartId, UserId, Action, CreatedDate) VALUES (?, ?, 'CLEARED', ?)").run(cartId, userId, timestamp);
}