import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRejectionReason } from "../src/payment-review.js";

test("payment verification does not require a rejection reason", () => {
  assert.equal(normalizeRejectionReason("VERIFIED", undefined), null);
});

test("payment rejection requires and trims a reason", () => {
  assert.equal(normalizeRejectionReason("REJECTED", "  Invalid UTR  "), "Invalid UTR");
  assert.throws(() => normalizeRejectionReason("REJECTED", undefined), /rejection reason is required/i);
});