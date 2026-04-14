import assert from "node:assert/strict";
import test from "node:test";

import { buildAbsoluteAppUrl, getAppBaseUrl } from "../src/lib/app-url";
import {
  getClientIpFromHeaders,
  hashSecurityValue,
} from "../src/lib/auth-rate-limit";
import { hashPasswordResetToken } from "../src/lib/password-reset";

function setEnvValue(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  Object.assign(process.env, { [name]: value });
}

test("getAppBaseUrl prefers APP_BASE_URL and trims trailing slashes", () => {
  const previousAppBaseUrl = process.env.APP_BASE_URL;
  const previousNextAuthUrl = process.env.NEXTAUTH_URL;
  const previousNodeEnv = process.env.NODE_ENV;

  setEnvValue("APP_BASE_URL", "https://app.example.com/");
  setEnvValue("NEXTAUTH_URL", "https://fallback.example.com");
  setEnvValue("NODE_ENV", "production");

  assert.equal(getAppBaseUrl(), "https://app.example.com");
  assert.equal(
    buildAbsoluteAppUrl("/auth/reset-password/token"),
    "https://app.example.com/auth/reset-password/token"
  );

  setEnvValue("APP_BASE_URL", previousAppBaseUrl);
  setEnvValue("NEXTAUTH_URL", previousNextAuthUrl);
  setEnvValue("NODE_ENV", previousNodeEnv);
});

test("getAppBaseUrl falls back to localhost in non-production", () => {
  const previousAppBaseUrl = process.env.APP_BASE_URL;
  const previousNextAuthUrl = process.env.NEXTAUTH_URL;
  const previousNodeEnv = process.env.NODE_ENV;

  setEnvValue("APP_BASE_URL", undefined);
  setEnvValue("NEXTAUTH_URL", undefined);
  setEnvValue("NODE_ENV", "development");

  assert.equal(getAppBaseUrl(), "http://localhost:3000");

  setEnvValue("APP_BASE_URL", previousAppBaseUrl);
  setEnvValue("NEXTAUTH_URL", previousNextAuthUrl);
  setEnvValue("NODE_ENV", previousNodeEnv);
});

test("getClientIpFromHeaders prefers x-forwarded-for", () => {
  const ip = getClientIpFromHeaders({
    "x-forwarded-for": "203.0.113.10, 10.0.0.1",
    "x-real-ip": "198.51.100.12",
  });

  assert.equal(ip, "203.0.113.10");
});

test("hash helpers are deterministic and do not leak raw values", () => {
  const subjectHash = hashSecurityValue("chef@example.com");
  const resetHash = hashPasswordResetToken("plain-reset-token");

  assert.equal(subjectHash, hashSecurityValue("chef@example.com"));
  assert.equal(resetHash, hashPasswordResetToken("plain-reset-token"));
  assert.notEqual(subjectHash.includes("chef@example.com"), true);
  assert.notEqual(resetHash.includes("plain-reset-token"), true);
});
