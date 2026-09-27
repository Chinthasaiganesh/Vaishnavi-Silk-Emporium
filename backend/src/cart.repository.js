import { db } from "./db.js";
import { nowIso } from "./utils.js";

const cartItemsQuery = `
  SELECT ci.CartItemId, ci.CartId, ci.ProductId, ci.Quantity, p.Price AS OriginalPrice, p.DiscountedPrice, COALESCE(p.DiscountedPrice, p.Price) AS UnitPrice, ci.CreatedDate, ci.UpdatedDate,
    p.ProductName, p.Category, p.ImageUrl, COALESCE(i.AvailableStock, 0) AS AvailableStock, COALESCE(i.ReservedStock, 0) AS ReservedStock
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

export async function getCartItem(cartId, cartItemId, tx = null) {
  const sql = `${cartItemsQuery} WHERE ci.CartId = ? AND ci.CartItemId = ?`;
  return tx ? await tx.get(sql, [cartId, cartItemId]) : await db.prepare(sql).get(cartId, cartItemId);
}

export async function getProduct(productId, tx = null) {
  const sql = "SELECT p.ProductId, p.ProductName, COALESCE(p.DiscountedPrice, p.Price) AS Price, p.IsActive, COALESCE(i.AvailableStock, 0) AS AvailableStock, COALESCE(i.ReservedStock, 0) AS ReservedStock FROM Products p LEFT JOIN Inventory i ON i.ProductId = p.ProductId WHERE p.ProductId = ?";
  return tx ? await tx.get(sql, [productId]) : await db.prepare(sql).get(productId);
}

export async function getCartItemByProduct(cartId, productId, tx = null) {
  const sql = "SELECT * FROM CartItems WHERE CartId = ? AND ProductId = ?";
  return tx ? await tx.get(sql, [cartId, productId]) : await db.prepare(sql).get(cartId, productId);
}

export async function saveItem(cartId, productId, quantity, unitPrice, action, userId, oldQuantity = null, tx = null) {
  const timestamp = nowIso();
  const existing = await getCartItemByProduct(cartId, productId, tx);
  let cartItemId;
  if (existing) {
    if (tx) await tx.run("UPDATE CartItems SET Quantity = ?, UnitPrice = ?, UpdatedDate = ? WHERE CartItemId = ?", [quantity, unitPrice, timestamp, existing.CartItemId]);
    else await db.prepare("UPDATE CartItems SET Quantity = ?, UnitPrice = ?, UpdatedDate = ? WHERE CartItemId = ?").run(quantity, unitPrice, timestamp, existing.CartItemId);
    cartItemId = existing.CartItemId;
  } else {
    const result = tx
      ? await tx.run("INSERT INTO CartItems (CartId, ProductId, Quantity, UnitPrice, CreatedDate, UpdatedDate) VALUES (?, ?, ?, ?, ?, ?)", [cartId, productId, quantity, unitPrice, timestamp, timestamp])
      : await db.prepare("INSERT INTO CartItems (CartId, ProductId, Quantity, UnitPrice, CreatedDate, UpdatedDate) VALUES (?, ?, ?, ?, ?, ?)").run(cartId, productId, quantity, unitPrice, timestamp, timestamp);
    cartItemId = result.lastInsertRowid;
  }
  if (tx) {
    await tx.run("UPDATE Carts SET UpdatedDate = ? WHERE CartId = ?", [timestamp, cartId]);
    await tx.run("INSERT INTO CartAuditLog (CartId, CartItemId, UserId, ProductId, Action, OldQuantity, NewQuantity, CreatedDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [cartId, cartItemId, userId, productId, action, oldQuantity, quantity, timestamp]);
  } else {
    await db.prepare("UPDATE Carts SET UpdatedDate = ? WHERE CartId = ?").run(timestamp, cartId);
    await db.prepare("INSERT INTO CartAuditLog (CartId, CartItemId, UserId, ProductId, Action, OldQuantity, NewQuantity, CreatedDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(cartId, cartItemId, userId, productId, action, oldQuantity, quantity, timestamp);
  }
  const savedItem = await getCartItem(cartId, cartItemId, tx);
  return savedItem;
}

export async function removeItem(cartId, cartItemId, userId, tx = null) {
  const item = await getCartItem(cartId, cartItemId, tx);
  if (!item) return null;
  const timestamp = nowIso();
  if (tx) {
    await tx.run("DELETE FROM CartItems WHERE CartItemId = ? AND CartId = ?", [cartItemId, cartId]);
    await tx.run("UPDATE Carts SET UpdatedDate = ? WHERE CartId = ?", [timestamp, cartId]);
    await tx.run("INSERT INTO CartAuditLog (CartId, UserId, ProductId, Action, OldQuantity, NewQuantity, CreatedDate) VALUES (?, ?, ?, 'REMOVED', ?, 0, ?)", [cartId, userId, item.ProductId, item.Quantity, timestamp]);
  } else {
    await db.prepare("DELETE FROM CartItems WHERE CartItemId = ? AND CartId = ?").run(cartItemId, cartId);
    await db.prepare("UPDATE Carts SET UpdatedDate = ? WHERE CartId = ?").run(timestamp, cartId);
    await db.prepare("INSERT INTO CartAuditLog (CartId, UserId, ProductId, Action, OldQuantity, NewQuantity, CreatedDate) VALUES (?, ?, ?, 'REMOVED', ?, 0, ?)").run(cartId, userId, item.ProductId, item.Quantity, timestamp);
  }
  return item;
}

export async function clearCart(cartId, userId, tx = null) {
  const timestamp = nowIso();
  if (tx) {
    await tx.run("DELETE FROM CartItems WHERE CartId = ?", [cartId]);
    await tx.run("UPDATE Carts SET UpdatedDate = ? WHERE CartId = ?", [timestamp, cartId]);
    await tx.run("INSERT INTO CartAuditLog (CartId, UserId, Action, CreatedDate) VALUES (?, ?, 'CLEARED', ?)", [cartId, userId, timestamp]);
  } else {
    await db.prepare("DELETE FROM CartItems WHERE CartId = ?").run(cartId);
    await db.prepare("UPDATE Carts SET UpdatedDate = ? WHERE CartId = ?").run(timestamp, cartId);
    await db.prepare("INSERT INTO CartAuditLog (CartId, UserId, Action, CreatedDate) VALUES (?, ?, 'CLEARED', ?)").run(cartId, userId, timestamp);
  }
}