import crypto from "node:crypto";
import { config } from "./config.js";
import { db, transaction } from "./db.js";
import { nowIso } from "./utils.js";

function reservationError(message, code = "RESERVATION_FAILED", status = 409) {
  return Object.assign(new Error(message), { code, status });
}

function expiresAtFrom(timestamp) {
  return new Date(new Date(timestamp).getTime() + config.checkoutReservationMinutes * 60 * 1000).toISOString();
}

async function releaseLockedReservation(tx, reservation, status) {
  const items = await tx.all("SELECT ProductId, Quantity FROM CheckoutReservationItems WHERE ReservationId = ?", [reservation.ReservationId]);
  for (const item of items) {
    await tx.run("UPDATE Inventory SET AvailableStock = AvailableStock + ?, ReservedStock = ReservedStock - ?, Status = CASE WHEN AvailableStock + ? = 0 THEN 'OUT_OF_STOCK' WHEN AvailableStock + ? <= 5 THEN 'LOW_STOCK' ELSE 'IN_STOCK' END, UpdatedDate = ? WHERE ProductId = ? AND ReservedStock >= ?", [item.Quantity, item.Quantity, item.Quantity, item.Quantity, nowIso(), item.ProductId, item.Quantity]);
  }
  await tx.run("UPDATE CheckoutReservations SET ReservationStatus = ?, UpdatedDate = ? WHERE ReservationId = ?", [status, nowIso(), reservation.ReservationId]);
  return { ...reservation, ReservationStatus: status, items };
}

export async function releaseExpiredReservations() {
  return await transaction(async (tx) => {
    const expired = await tx.all("SELECT * FROM CheckoutReservations WHERE ReservationStatus = 'ACTIVE' AND ExpiresAt <= ? FOR UPDATE SKIP LOCKED", [nowIso()]);
    const released = [];
    for (const reservation of expired) released.push(await releaseLockedReservation(tx, reservation, "EXPIRED"));
    return released;
  });
}

export async function listExpiringReservations() {
  return await db.prepare("SELECT ReservationId, UserId, ExpiresAt FROM CheckoutReservations WHERE ReservationStatus = 'ACTIVE' AND ExpiresAt > ? AND ExpiresAt <= ?").all(nowIso(), new Date(Date.now() + 2 * 60 * 1000).toISOString());
}

export function reservationView(reservation) {
  if (!reservation) return null;
  const now = Date.now();
  const expiresAt = new Date(reservation.ExpiresAt).getTime();
  const isActive = reservation.ReservationStatus === "ACTIVE" && expiresAt > now;
  return {
    ...reservation,
    ReservationStatus: reservation.ReservationStatus === "ACTIVE" && !isActive ? "EXPIRED" : reservation.ReservationStatus,
    serverTime: new Date(now).toISOString(),
    remainingSeconds: isActive ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0,
    totalSeconds: config.checkoutReservationMinutes * 60
  };
}

export async function getReservation(userId, reservationId) {
  const reservation = await db.prepare("SELECT * FROM CheckoutReservations WHERE ReservationId = ? AND UserId = ?").get(reservationId, userId);
  if (!reservation) return null;
  const items = await db.prepare("SELECT * FROM CheckoutReservationItems WHERE ReservationId = ? ORDER BY ReservationItemId").all(reservationId);
  return { ...reservation, items };
}

export async function reserveCart(userId, addressId, sessionId) {
  if (!sessionId || sessionId.length > 100) throw reservationError("A valid checkout session is required.", "INVALID_RESERVATION_SESSION", 400);
  await releaseExpiredReservations();
  const reservationId = await transaction(async (tx) => {
    let existing = await tx.get("SELECT * FROM CheckoutReservations WHERE UserId = ? AND ReservationSessionId = ? FOR UPDATE", [userId, sessionId]);
    if (!existing) existing = await tx.get("SELECT * FROM CheckoutReservations WHERE UserId = ? AND ReservationStatus = 'ACTIVE' ORDER BY ReservedAt DESC LIMIT 1 FOR UPDATE", [userId]);
    if (existing?.ReservationStatus === "ACTIVE" && new Date(existing.ExpiresAt).getTime() > Date.now()) return existing.ReservationId;
    if (existing?.ReservationStatus === "ACTIVE") await releaseLockedReservation(tx, existing, "EXPIRED");
    const address = addressId ? await tx.get("SELECT AddressId FROM Addresses WHERE AddressId = ? AND UserId = ?", [addressId, userId]) : await tx.get("SELECT AddressId FROM Addresses WHERE UserId = ? AND IsDefault = 1 ORDER BY AddressId LIMIT 1", [userId]);
    if (!address) throw reservationError("Address not found for this user.", "ADDRESS_NOT_FOUND", 404);
    const cartItems = await tx.all("SELECT ci.ProductId, ci.Quantity, p.ProductName, COALESCE(p.DiscountedPrice, p.Price) AS UnitPrice, p.IsActive FROM CartItems ci JOIN Carts c ON c.CartId = ci.CartId JOIN Products p ON p.ProductId = ci.ProductId WHERE c.UserId = ? ORDER BY ci.CreatedDate", [userId]);
    if (!cartItems.length) throw reservationError("Cart is empty.", "CART_EMPTY", 400);
    const timestamp = nowIso();
    const newReservationId = existing?.ReservationId || crypto.randomUUID();
    if (existing) {
      await tx.run("DELETE FROM CheckoutReservationItems WHERE ReservationId = ?", [newReservationId]);
      await tx.run("UPDATE CheckoutReservations SET AddressId = ?, ReservationStatus = 'ACTIVE', ReservedAt = ?, ExpiresAt = ?, UpdatedDate = ? WHERE ReservationId = ?", [address.AddressId, timestamp, expiresAtFrom(timestamp), timestamp, newReservationId]);
    } else {
      await tx.run("INSERT INTO CheckoutReservations (ReservationId, UserId, AddressId, ReservationSessionId, ReservationStatus, ReservedAt, ExpiresAt, UpdatedDate) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)", [newReservationId, userId, address.AddressId, sessionId, timestamp, expiresAtFrom(timestamp), timestamp]);
    }
    for (const item of cartItems) {
      const inventory = await tx.get("SELECT i.ProductId, i.AvailableStock, i.ReservedStock FROM Inventory i WHERE i.ProductId = ? FOR UPDATE", [item.ProductId]);
      if (!item.IsActive || !inventory || inventory.AvailableStock < item.Quantity) throw reservationError(`Only ${inventory?.AvailableStock || 0} item${inventory?.AvailableStock === 1 ? "" : "s"} available for ${item.ProductName}.`, "INSUFFICIENT_STOCK");
      await tx.run("UPDATE Inventory SET AvailableStock = AvailableStock - ?, ReservedStock = ReservedStock + ?, Status = CASE WHEN AvailableStock - ? = 0 THEN 'OUT_OF_STOCK' WHEN AvailableStock - ? <= 5 THEN 'LOW_STOCK' ELSE 'IN_STOCK' END, UpdatedDate = ? WHERE ProductId = ? AND AvailableStock >= ?", [item.Quantity, item.Quantity, item.Quantity, item.Quantity, timestamp, item.ProductId, item.Quantity]);
      await tx.run("INSERT INTO CheckoutReservationItems (ReservationId, ProductId, ProductName, UnitPrice, Quantity, CreatedDate) VALUES (?, ?, ?, ?, ?, ?)", [newReservationId, item.ProductId, item.ProductName, item.UnitPrice, item.Quantity, timestamp]);
    }
    return newReservationId;
  });
  return await getReservation(userId, reservationId);
}

export async function releaseReservation(userId, reservationId) {
  const result = await transaction(async (tx) => {
    const reservation = await tx.get("SELECT * FROM CheckoutReservations WHERE ReservationId = ? AND UserId = ? FOR UPDATE", [reservationId, userId]);
    if (!reservation) return null;
    if (reservation.ReservationStatus !== "ACTIVE") return reservation;
    return await releaseLockedReservation(tx, reservation, "RELEASED");
  });
  return result ? await getReservation(userId, reservationId) : null;
}

export async function markReservationConverted(tx, reservationId) {
  await tx.run("UPDATE CheckoutReservations SET ReservationStatus = 'CONVERTED_TO_ORDER', UpdatedDate = ? WHERE ReservationId = ?", [nowIso(), reservationId]);
}

export { reservationError };