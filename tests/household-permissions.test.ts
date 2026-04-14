import assert from "node:assert/strict";
import test from "node:test";

import {
  canAssignHouseholdRole,
  canManageHouseholdUsers,
} from "../src/lib/household-permissions";

test("only owner/admin can manage household users", () => {
  assert.equal(canManageHouseholdUsers("owner"), true);
  assert.equal(canManageHouseholdUsers("admin"), true);
  assert.equal(canManageHouseholdUsers("member"), false);
});

test("admin cannot assign owner role", () => {
  assert.equal(canAssignHouseholdRole("admin", "owner"), false);
});

test("owner can assign all roles", () => {
  assert.equal(canAssignHouseholdRole("owner", "owner"), true);
  assert.equal(canAssignHouseholdRole("owner", "admin"), true);
  assert.equal(canAssignHouseholdRole("owner", "member"), true);
});
