import crypto from "crypto";
import path from "path";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "./config.js";
import { logSafe } from "./safe-logger.js";

const s3Client = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey
  },
  forcePathStyle: true
});

// Supabase's S3 endpoint (".../storage/v1/s3") and public object endpoint (".../storage/v1/object/public") share a base.
function publicBaseUrl() {
  return config.s3.endpoint.replace(/\/s3\/?$/, "/object/public");
}

function buildPublicUrl(key) {
  return `${publicBaseUrl()}/${config.s3.bucket}/${key}`;
}

function requirePrivatePaymentBucket() {
  const bucket = config.s3.paymentProofBucket;
  if (!bucket || bucket === config.s3.bucket) {
    throw Object.assign(new Error("A dedicated private payment-proof bucket must be configured."), { status: 503, code: "PAYMENT_PROOF_STORAGE_NOT_CONFIGURED" });
  }
  return bucket;
}

export function extractKeyFromUrl(url) {
  if (!url) return null;
  const prefix = `${buildPublicUrl("")}`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

export async function uploadImage(buffer, { originalName, mimetype, folder }) {
  const ext = path.extname(originalName || "").toLowerCase() || ".jpg";
  const key = `${folder}/${crypto.randomUUID()}${ext}`;
  const isPaymentProof = folder === "payment-proofs";
  const bucket = isPaymentProof ? requirePrivatePaymentBucket() : config.s3.bucket;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
      CacheControl: isPaymentProof ? "private, no-store" : "public, max-age=31536000, immutable"
    })
  );

  return { key, url: isPaymentProof ? null : buildPublicUrl(key) };
}

export async function createPaymentProofSignedUrl(key, expiresIn = 300) {
  if (typeof key !== "string" || !key.startsWith("payment-proofs/") || key.includes("..")) return null;
  const bucket = requirePrivatePaymentBucket();
  const expiration = Math.max(60, Math.min(300, Number(expiresIn) || 300));
  return getSignedUrl(s3Client, new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseCacheControl: "private, no-store",
    ResponseContentDisposition: "attachment"
  }), { expiresIn: expiration });
}

export async function copyLegacyPaymentProofToPrivate(publicUrl) {
  const legacyKey = extractKeyFromUrl(publicUrl);
  if (!legacyKey || !legacyKey.startsWith("payment-proofs/") || legacyKey.includes("..")) return null;
  const privateBucket = requirePrivatePaymentBucket();
  const source = await s3Client.send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: legacyKey }));
  const body = Buffer.from(await source.Body.transformToByteArray());
  const key = `payment-proofs/${crypto.randomUUID()}${path.extname(legacyKey).toLowerCase() || ".jpg"}`;
  await s3Client.send(new PutObjectCommand({
    Bucket: privateBucket,
    Key: key,
    Body: body,
    ContentType: source.ContentType || "application/octet-stream",
    CacheControl: "private, no-store"
  }));
  return { key, legacyKey };
}

export async function deleteLegacyPaymentProof(legacyKey) {
  if (typeof legacyKey !== "string" || !legacyKey.startsWith("payment-proofs/") || legacyKey.includes("..")) return;
  await s3Client.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: legacyKey }));
}

export async function deletePrivatePaymentProof(key) {
  if (typeof key !== "string" || !key.startsWith("payment-proofs/") || key.includes("..")) return;
  await s3Client.send(new DeleteObjectCommand({ Bucket: requirePrivatePaymentBucket(), Key: key }));
}

export async function deleteImage(url) {
  const key = extractKeyFromUrl(url);
  if (!key) return;
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key }));
  } catch (error) {
    logSafe("warn", "storage_object_delete_failed", { diagnosticCode: error.code });
  }
}
