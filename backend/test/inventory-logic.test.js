import test from "node:test";
import assert from "node:assert/strict";
import { calculateInventoryState } from "../src/inventory-logic.js";

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