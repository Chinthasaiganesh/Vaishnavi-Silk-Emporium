import { db } from "./db.js";
import { nowIso } from "./utils.js";

export function listAddresses(userId) { return db.prepare("SELECT * FROM Addresses WHERE UserId = ? ORDER BY IsDefault DESC, datetime(UpdatedDate) DESC").all(userId); }
export function getAddress(userId, addressId) { return db.prepare("SELECT * FROM Addresses WHERE UserId = ? AND AddressId = ?").get(userId, addressId); }
export function getDefaultAddress(userId) { return db.prepare("SELECT * FROM Addresses WHERE UserId = ? AND IsDefault = 1 ORDER BY AddressId LIMIT 1").get(userId); }
export function createAddress(userId, input) {
  const timestamp = nowIso();
  db.exec("BEGIN IMMEDIATE");
  try {
    if (input.isDefault || !getDefaultAddress(userId)) db.prepare("UPDATE Addresses SET IsDefault = 0 WHERE UserId = ?").run(userId);
    const result = db.prepare("INSERT INTO Addresses (UserId, FullName, MobileNumber, AddressLine1, AddressLine2, City, State, PostalCode, Country, IsDefault, CreatedDate, UpdatedDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(userId, input.fullName, input.mobileNumber, input.addressLine1, input.addressLine2 || "", input.city, input.state, input.postalCode, input.country || "India", input.isDefault ? 1 : 0, timestamp, timestamp);
    db.prepare("INSERT INTO OrderAuditLog (UserId, Action, CreatedDate) VALUES (?, 'ADDRESS_ADDED', ?)").run(userId, timestamp);
    db.exec("COMMIT");
    return getAddress(userId, result.lastInsertRowid);
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function updateAddress(userId, addressId, input) {
  const existing = getAddress(userId, addressId);
  if (!existing) return null;
  const timestamp = nowIso();
  db.exec("BEGIN IMMEDIATE");
  try {
    if (input.isDefault) db.prepare("UPDATE Addresses SET IsDefault = 0 WHERE UserId = ?").run(userId);
    db.prepare("UPDATE Addresses SET FullName = ?, MobileNumber = ?, AddressLine1 = ?, AddressLine2 = ?, City = ?, State = ?, PostalCode = ?, Country = ?, IsDefault = ?, UpdatedDate = ? WHERE UserId = ? AND AddressId = ?").run(input.fullName, input.mobileNumber, input.addressLine1, input.addressLine2 || "", input.city, input.state, input.postalCode, input.country || "India", input.isDefault ? 1 : 0, timestamp, userId, addressId);
    db.exec("COMMIT");
    return getAddress(userId, addressId);
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function deleteAddress(userId, addressId) { const address = getAddress(userId, addressId); if (!address) return null; db.prepare("DELETE FROM Addresses WHERE UserId = ? AND AddressId = ?").run(userId, addressId); if (address.IsDefault) db.prepare("UPDATE Addresses SET IsDefault = 1 WHERE AddressId = (SELECT AddressId FROM Addresses WHERE UserId = ? ORDER BY AddressId LIMIT 1)").run(userId); return address; }