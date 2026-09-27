import test from "node:test";
import assert from "node:assert/strict";
import { calculateInventoryState } from "../src/inventory-logic.js";
import { stockUnavailableError } from "../src/utils.js";

test("available stock is current stock less reservations", () => {
  assert.deepEqual(calculateInventoryState(5, 3), {
    CurrentStock: 5,
    ReservedStock: 3,
    AvailableStock: 2,
    Status: "LOW_STOCK"
  });
});

test("zero available stock is out of stock even when units remain reserved", () => {
  assert.deepEqual(calculateInventoryState(2, 2), {
    CurrentStock: 2,
    ReservedStock: 2,
    AvailableStock: 0,
    Status: "OUT_OF_STOCK"
  });
});

test("rejects stock reductions below active reservations", () => {
  assert.throws(() => calculateInventoryState(1, 2), (error) => error.code === "STOCK_BELOW_RESERVATIONS");
});

test("stock conflicts return the canonical available and reserved quantities", () => {
  const error = stockUnavailableError(0, 2, "Sample saree");
  assert.equal(error.code, "TEMPORARILY_RESERVED");
  assert.equal(error.availableStock, 0);
  assert.equal(error.reservedStock, 2);
  assert.equal(error.currentStock, 2);
});

test("out-of-stock conflicts expose zero availability for client reconciliation", () => {
  const error = stockUnavailableError(0, 0, "Sample saree");
  assert.equal(error.code, "INSUFFICIENT_STOCK");
  assert.equal(error.availableStock, 0);
  assert.equal(error.reservedStock, 0);
  assert.equal(error.currentStock, 0);
});

test("partial-stock conflicts preserve remaining sellable quantity", () => {
  const error = stockUnavailableError(2, 1, "Sample saree");
  assert.equal(error.availableStock, 2);
  assert.equal(error.reservedStock, 1);
  assert.equal(error.currentStock, 3);
});