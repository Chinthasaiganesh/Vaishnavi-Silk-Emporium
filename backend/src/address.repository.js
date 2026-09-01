import { db, transaction } from "./db.js";
import { nowIso } from "./utils.js";

export async function listAddresses(userId) {
  return await db.prepare("SELECT * FROM Addresses WHERE UserId = ? ORDER BY IsDefault DESC, datetime(UpdatedDate) DESC").all(userId);
}

export async function getAddress(userId, addressId) {
  return await db.prepare("SELECT * FROM Addresses WHERE UserId = ? AND AddressId = ?").get(userId, addressId);
}

export async function getDefaultAddress(userId) {
  return await db.prepare("SELECT * FROM Addresses WHERE UserId = ? AND IsDefault = 1 ORDER BY AddressId LIMIT 1").get(userId);
}

export async function createAddress(userId, input) {
  const timestamp = nowIso();
  return await transaction(async (tx) => {
    const defaultAddress = await tx.get("SELECT AddressId FROM Addresses WHERE UserId = ? AND IsDefault = 1 ORDER BY AddressId LIMIT 1", [userId]);
    if (input.isDefault || !defaultAddress) await tx.run("UPDATE Addresses SET IsDefault = 0 WHERE UserId = ?", [userId]);
    const result = await tx.run("INSERT INTO Addresses (UserId, FullName, MobileNumber, AddressLine1, AddressLine2, City, State, PostalCode, Country, IsDefault, CreatedDate, UpdatedDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [userId, input.fullName, input.mobileNumber, input.addressLine1, input.addressLine2 || "", input.city, input.state, input.postalCode, input.country || "India", input.isDefault ? 1 : 0, timestamp, timestamp]);
    await tx.run("INSERT INTO OrderAuditLog (UserId, Action, CreatedDate) VALUES (?, 'ADDRESS_ADDED', ?)", [userId, timestamp]);
    return await tx.get("SELECT * FROM Addresses WHERE UserId = ? AND AddressId = ?", [userId, result.lastInsertRowid]);
  });
}

export async function updateAddress(userId, addressId, input) {
  return await transaction(async (tx) => {
    const existing = await tx.get("SELECT * FROM Addresses WHERE UserId = ? AND AddressId = ?", [userId, addressId]);
    if (!existing) return null;
    const timestamp = nowIso();
    if (input.isDefault) await tx.run("UPDATE Addresses SET IsDefault = 0 WHERE UserId = ?", [userId]);
    await tx.run("UPDATE Addresses SET FullName = ?, MobileNumber = ?, AddressLine1 = ?, AddressLine2 = ?, City = ?, State = ?, PostalCode = ?, Country = ?, IsDefault = ?, UpdatedDate = ? WHERE UserId = ? AND AddressId = ?", [input.fullName, input.mobileNumber, input.addressLine1, input.addressLine2 || "", input.city, input.state, input.postalCode, input.country || "India", input.isDefault ? 1 : 0, timestamp, userId, addressId]);
    return await tx.get("SELECT * FROM Addresses WHERE UserId = ? AND AddressId = ?", [userId, addressId]);
  });
}

export async function deleteAddress(userId, addressId) {
  return await transaction(async (tx) => {
    const address = await tx.get("SELECT * FROM Addresses WHERE UserId = ? AND AddressId = ?", [userId, addressId]);
    if (!address) return null;
    await tx.run("DELETE FROM Addresses WHERE UserId = ? AND AddressId = ?", [userId, addressId]);
    if (address.IsDefault) await tx.run("UPDATE Addresses SET IsDefault = 1 WHERE AddressId = (SELECT AddressId FROM Addresses WHERE UserId = ? ORDER BY AddressId LIMIT 1)", [userId]);
    return address;
  });
}
