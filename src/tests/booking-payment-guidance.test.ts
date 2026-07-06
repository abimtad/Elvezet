import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPaymentGuidance } from "../services/booking-payment-guidance";
const booking = {status: "pending", paymentStatus: "unpaid", totalAmount: 1500};
const business = {name: "Test business", settlementAccount: "test-account", settlementBank: "cbe"};
test("instructions use only the selected business and booking amount", () => {
  const guidance = buildPaymentGuidance(booking, business);
  assert.equal(guidance.receivingAccount, "test-account");
  assert.equal(guidance.amount, 1500);
  assert.equal(buildPaymentGuidance(booking, {name:"Other"}).receivingAccount, null);
  assert.deepEqual(buildPaymentGuidance(booking, {name:"Other"}).actions, ["contact_business"]);
});
test("failed and mismatched receipts do not tell users to pay twice", () => {
  for (const paymentVerificationStatus of ["failed", "mismatch"]) {
    const guidance = buildPaymentGuidance({...booking, paymentVerificationStatus}, business);
    assert.match(guidance.text, /Do not pay again/);
    assert.ok(guidance.actions.includes("upload_receipt"));
  }
});
test("checking, paid, closed and late payments cannot request another payment", () => {
  for (const fields of [{paymentStatus:"paid"}, {status:"expired"}, {status:"cancelled"},
    {paymentVerificationStatus:"queued"}, {paymentVerificationStatus:"manual_review"}]) {
    assert.ok(!buildPaymentGuidance({...booking, ...fields}, business).actions.includes("upload_receipt"));
  }
  assert.equal(buildPaymentGuidance({...booking, paymentStatus:"paid"}, business).code,"paid");
});
