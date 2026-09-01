import crypto from "crypto";
import path from "path";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { config } from "./config.js";

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

export function extractKeyFromUrl(url) {
  if (!url) return null;
  const prefix = `${buildPublicUrl("")}`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

export async function uploadImage(buffer, { originalName, mimetype, folder }) {
  const ext = path.extname(originalName || "").toLowerCase() || ".jpg";
  const key = `${folder}/${crypto.randomUUID()}${ext}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
      CacheControl: "public, max-age=31536000, immutable"
    })
  );

  return { key, url: buildPublicUrl(key) };
}

export async function deleteImage(url) {
  const key = extractKeyFromUrl(url);
  if (!key) return;
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key }));
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", message: "Failed to delete old S3 object", key, error: error.message }));
  }
}
