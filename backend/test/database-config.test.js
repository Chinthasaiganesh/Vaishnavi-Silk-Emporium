import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("requires explicit credentials in production", () => {
  const configPath = fileURLToPath(new URL("../src/config.js", import.meta.url));
  assert.throws(() => execFileSync(process.execPath, ["--input-type=module", "-e", `process.env.NODE_ENV='production'; process.env.JWT_SECRET='${"x".repeat(32)}'; await import(${JSON.stringify(configPath)})`], { env: { PATH: process.env.PATH, NODE_ENV: "production", JWT_SECRET: "x".repeat(32) } }), /required in production/);
});
