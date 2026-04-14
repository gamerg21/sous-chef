import assert from "node:assert/strict";
import test from "node:test";

import { isValidEmail, normalizeEmail } from "../src/lib/auth-utils";

test("normalizeEmail lowercases and trims", () => {
  assert.equal(normalizeEmail("  USER+tag@Example.COM "), "user+tag@example.com");
});

test("isValidEmail accepts valid addresses", () => {
  assert.equal(isValidEmail("chef@example.com"), true);
  assert.equal(isValidEmail("chef.name+1@example.co.uk"), true);
});

test("isValidEmail rejects invalid addresses", () => {
  assert.equal(isValidEmail("not-an-email"), false);
  assert.equal(isValidEmail("chef@"), false);
  assert.equal(isValidEmail("chef @example.com"), false);
});
