import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("requires explicit credentials in production", () => {
  const configPath = fileURLToPath(new URL("../src/config.js", import.meta.url));
  assert.throws(() => execFileSync(process.execPath, ["--input-type=module", "-e", `process.env.NODE_ENV='production'; process.env.JWT_SECRET='${"x".repeat(32)}'; await import(${JSON.stringify(configPath)})`], { env: { PATH: process.env.PATH, NODE_ENV: "production", JWT_SECRET: "x".repeat(32) } }), /required in production/);
});

test("requires a dedicated payment-proof bucket in production", () => {
  const configPath = fileURLToPath(new URL("../src/config.js", import.meta.url));
  const env = {
    PATH: process.env.PATH,
    NODE_ENV: "production",
    JWT_SECRET: "x".repeat(32),
    ADMIN_USERNAME: "admin-test",
    ADMIN_PASSWORD: "not-a-real-password",
    USER_USERNAME: "customer-test",
    USER_PASSWORD: "not-a-real-password",
    S3_ENDPOINT: "https://storage.example.invalid/storage/v1/s3",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY: "access-test",
    S3_SECRET_KEY: "secret-test",
    S3_BUCKET: "public-products"
  };
  assert.throws(
    () => execFileSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(configPath)})`], { env }),
    /S3_PAYMENT_PROOFS_BUCKET must name a dedicated private bucket/
  );
});

test("rejects using the public product bucket for payment proofs in production", () => {
  const configPath = fileURLToPath(new URL("../src/config.js", import.meta.url));
  const env = {
    PATH: process.env.PATH,
    NODE_ENV: "production",
    JWT_SECRET: "x".repeat(32),
    ADMIN_USERNAME: "admin-test",
    ADMIN_PASSWORD: "not-a-real-password",
    USER_USERNAME: "customer-test",
    USER_PASSWORD: "not-a-real-password",
    S3_ENDPOINT: "https://storage.example.invalid/storage/v1/s3",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY: "access-test",
    S3_SECRET_KEY: "secret-test",
    S3_BUCKET: "same-bucket",
    S3_PAYMENT_PROOFS_BUCKET: "same-bucket"
  };
  assert.throws(
    () => execFileSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(configPath)})`], { env }),
    /S3_PAYMENT_PROOFS_BUCKET must name a dedicated private bucket/
  );
});
