import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeVerification, isVerificationSuccessful } from "../services/verifyEt.service";

test("API transport success is not payment verification success", () => {
  const result = normalizeVerification({ success: true, data: { processingStatus: "completed", status: "failed", verified: false, amount: 1500 } });
  assert.equal(isVerificationSuccessful(result), false);
  assert.equal(isVerificationSuccessful(normalizeVerification({ success: true, data: [] })), false);
  assert.equal(isVerificationSuccessful({ status: "completed" }), false);
});
test("completed submission retains transaction details and settlement match", () => {
  const result = normalizeVerification({ success: true, data: [{ status: "success", verified: true, amount: 1500, settlementAccountMatch: { matched: true } }], verification: { processingStatus: "completed" } });
  assert.equal(isVerificationSuccessful(result), true);
  assert.equal(result.amount, 1500);
  assert.deepEqual(result.settlementAccountMatch, { matched: true });
});
