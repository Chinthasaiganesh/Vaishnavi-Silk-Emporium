import { db } from "./db.js";
import { copyLegacyPaymentProofToPrivate, deleteLegacyPaymentProof, deletePrivatePaymentProof, extractKeyFromUrl } from "./s3-storage.service.js";
import { logSafe } from "./safe-logger.js";

async function migratePaymentProofs(applyChanges) {
  const rows = await db.prepare('SELECT "OrderId", "PaymentScreenshotUrl", "PaymentScreenshotKey" FROM "Orders" WHERE "PaymentScreenshotUrl" IS NOT NULL ORDER BY "OrderId"').all();
  if (!applyChanges) {
    logSafe("info", "payment_proof_migration_dry_run_completed");
    return;
  }

  for (const row of rows) {
    const legacyKey = extractKeyFromUrl(row.PaymentScreenshotUrl);
    if (!legacyKey) {
      logSafe("error", "payment_proof_migration_unrecognized_legacy_url");
      throw Object.assign(new Error("A legacy payment proof URL is outside the configured public bucket."), { code: "LEGACY_PROOF_URL_UNRECOGNIZED" });
    }

    let privateKey = row.PaymentScreenshotKey;
    if (!privateKey) {
      const copied = await copyLegacyPaymentProofToPrivate(row.PaymentScreenshotUrl);
      if (!copied) throw Object.assign(new Error("Unable to copy a legacy payment proof to private storage."), { code: "LEGACY_PROOF_COPY_FAILED" });
      privateKey = copied.key;
      const saved = await db.prepare('UPDATE "Orders" SET "PaymentScreenshotKey" = ? WHERE "OrderId" = ? AND "PaymentScreenshotKey" IS NULL AND "PaymentScreenshotUrl" = ?').run(privateKey, row.OrderId, row.PaymentScreenshotUrl);
      if (!saved.changes) {
        await deletePrivatePaymentProof(privateKey);
        continue;
      }
    }

    await deleteLegacyPaymentProof(legacyKey);
    await db.prepare('UPDATE "Orders" SET "PaymentScreenshotUrl" = NULL WHERE "OrderId" = ? AND "PaymentScreenshotKey" = ?').run(row.OrderId, privateKey);
  }

  const remaining = await db.prepare('SELECT "OrderId" FROM "Orders" WHERE "PaymentScreenshotUrl" IS NOT NULL').all();
  if (remaining.length) throw Object.assign(new Error("Some legacy payment-proof URLs remain; keep the old bucket protected and rerun after resolving failures."), { code: "LEGACY_PROOFS_REMAIN" });
  logSafe("info", "payment_proof_migration_completed");
}

const applyChanges = process.argv.includes("--apply");
migratePaymentProofs(applyChanges)
  .catch((error) => {
    logSafe("error", "payment_proof_migration_failed", { diagnosticCode: error.code });
    process.exitCode = 1;
  })
  .finally(() => db.close());