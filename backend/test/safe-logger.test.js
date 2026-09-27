import test from "node:test";
import assert from "node:assert/strict";
import { logSafe, safeEndpoint } from "../src/safe-logger.js";

test("safe logger drops credentials, payment data, personal data, and unknown fields", () => {
  const output = [];
  const originalInfo = console.info;
  console.info = (entry) => output.push(entry);
  try {
    logSafe("info", "request_validation_failed", {
      requestId: "123e4567-e89b-42d3-a456-426614174000",
      endpoint: "/api/auth/login",
      method: "POST",
      statusCode: 400,
      userId: 12345,
      password: "secret-password",
      email: "person@example.com",
      mobileNumber: "5551234567",
      address: "1 Private Road",
      paymentReference: "UTR123456789",
      paymentScreenshotUrl: "https://storage.example/proof.png",
      authorization: "Bearer private-token",
      refreshToken: "private-refresh-token",
      sessionId: "private-session-id",
      requestBody: { password: "nested-secret" }
    });
  } finally {
    console.info = originalInfo;
  }

  assert.equal(output.length, 1);
  assert.deepEqual(JSON.parse(output[0]), {
    level: "info",
    event: "request_validation_failed",
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    endpoint: "/api/auth/login",
    method: "POST",
    statusCode: 400,
    userId: "***45"
  });
  assert.doesNotMatch(output[0], /secret-password|person@example\.com|5551234567|Private Road|UTR123456789|proof\.png|private-token|private-refresh-token|private-session-id|nested-secret/);
});

test("safe logger rejects non-template endpoints and malformed request IDs", () => {
  const output = [];
  const originalWarn = console.warn;
  console.warn = (entry) => output.push(entry);
  try {
    logSafe("warn", "request_rejected", {
      requestId: "customer@example.com",
      endpoint: "/api/orders/123?token=secret",
      method: "GET"
    });
  } finally {
    console.warn = originalWarn;
  }

  const record = JSON.parse(output[0]);
  assert.equal(record.requestId, undefined);
  assert.equal(record.endpoint, undefined);
});

test("safe endpoint logging uses the route template instead of OAuth query values", () => {
  const endpoint = safeEndpoint({
    baseUrl: "/api/auth",
    route: { path: "/oauth/:provider/callback" },
    originalUrl: "/api/auth/oauth/google/callback?code=secret-code&state=secret-state"
  });
  assert.equal(endpoint, "/api/auth/oauth/:provider/callback");
  assert.doesNotMatch(endpoint, /google|secret-code|secret-state/);
});