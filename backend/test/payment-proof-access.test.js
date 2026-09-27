import test from "node:test";
import assert from "node:assert/strict";
import { adminOrderWithPaymentProof, stripPaymentProof } from "../src/payment-proof-access.js";

test("customer order serialization removes legacy URLs and private object keys", () => {
  const order = { OrderId: 7, OrderNumber: "VSE-2026-000007", PaymentScreenshotUrl: "https://public.invalid/proof.jpg", PaymentScreenshotKey: "payment-proofs/private.jpg" };
  assert.deepEqual(stripPaymentProof(order), { OrderId: 7, OrderNumber: "VSE-2026-000007" });
});

test("admin order serialization signs a private key without returning the key", async () => {
  const calls = [];
  const result = await adminOrderWithPaymentProof(
    { OrderId: 7, PaymentScreenshotKey: "payment-proofs/private.jpg", PaymentScreenshotUrl: null },
    async (key, expiresIn) => { calls.push({ key, expiresIn }); return "https://storage.invalid/signed?expires=300"; }
  );
  assert.deepEqual(calls, [{ key: "payment-proofs/private.jpg", expiresIn: 300 }]);
  assert.equal(result.PaymentScreenshotUrl, "https://storage.invalid/signed?expires=300");
  assert.equal(result.PaymentScreenshotKey, undefined);
  assert.equal(result.paymentProofMigrationPending, false);
});

test("legacy public proof URL is withheld and marked for migration", async () => {
  const result = await adminOrderWithPaymentProof(
    { OrderId: 8, PaymentScreenshotUrl: "https://public.invalid/old-proof.jpg", PaymentScreenshotKey: null },
    async () => assert.fail("legacy public URL must not be signed")
  );
  assert.equal(result.PaymentScreenshotUrl, null);
  assert.equal(result.PaymentScreenshotKey, undefined);
  assert.equal(result.paymentProofMigrationPending, true);
});