import test from "node:test";
import assert from "node:assert/strict";
import { orderNumberFromIdempotencyKey } from "../src/order-reference.js";

test("creates a stable readable order number from the checkout idempotency key", () => {
  const key = "12345678-abcd-4abc-8def-1234567890ab";

  assert.equal(orderNumberFromIdempotencyKey(key), "VSE-12345678ABCD4ABC");
  assert.equal(orderNumberFromIdempotencyKey(key), "VSE-12345678ABCD4ABC");
});

test("rejects keys that cannot produce a unique order reference", () => {
  assert.throws(() => orderNumberFromIdempotencyKey("short-key"), /idempotency key/i);
});