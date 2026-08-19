import assert from "node:assert/strict";
import {
  isAdministratorRole,
  ownerLandingPath,
  safeAdminReturnUrl,
} from "./adminAuth";

assert.equal(isAdministratorRole(["admin"]), true);
assert.equal(isAdministratorRole(["moderator"]), true);
assert.equal(isAdministratorRole(["admin", "owner"]), true);
assert.equal(isAdministratorRole(["owner"]), false);
assert.equal(isAdministratorRole(["customer"]), false);
assert.equal(isAdministratorRole([]), false);
assert.equal(isAdministratorRole(undefined), false);

assert.equal(ownerLandingPath(["owner"]), "/");
assert.equal(ownerLandingPath(["staff"]), "/");
assert.equal(ownerLandingPath(["customer"]), "/auth/signin");

assert.equal(safeAdminReturnUrl(null), "/admin/overview");
assert.equal(safeAdminReturnUrl("https://evil.example/phish"), "/admin/overview");
assert.equal(safeAdminReturnUrl("//evil.example"), "/admin/overview");
assert.equal(safeAdminReturnUrl("/analytics"), "/admin/overview");
assert.equal(safeAdminReturnUrl("/admin/signin"), "/admin/overview");
assert.equal(safeAdminReturnUrl("/admin/tenants"), "/admin/tenants");
assert.equal(safeAdminReturnUrl("/admin/overview"), "/admin/overview");

console.log("adminAuth helpers: ok");
