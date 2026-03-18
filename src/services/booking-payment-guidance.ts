export type GuidanceInput = {
  status: string; paymentStatus: string; paymentVerificationStatus?: string;
  totalAmount: number; paymentScreenshotUrl?: string;
};
export function buildPaymentGuidance(booking: GuidanceInput, business: {
  name: string; settlementAccount?: string; settlementBank?: string;
}) {
  const state = booking.paymentVerificationStatus || "none";
  let code = "receipt_needed";
  let text = "If you have already paid, upload a clear receipt. Otherwise, pay the exact booking amount to this business's receiving account, then upload the receipt.";
  let actions = ["upload_receipt", "contact_business"];
  if (booking.paymentStatus === "paid") {
    code = "paid"; text = "Your payment has been approved. No further payment is needed."; actions = ["contact_business"];
  } else if (state === "manual_review") {
    code = "manual_review"; text = "This payment needs business review. Do not pay again; contact the business before making another booking."; actions = ["contact_business"];
  } else if (booking.status !== "pending") {
    code = "booking_closed"; text = "This booking is no longer awaiting payment. Do not send money for it. If you already paid, contact the business."; actions = ["contact_business"];
  } else if (["queued", "verifying"].includes(state)) {
    code = "checking"; text = "Your receipt is being checked. Wait and refresh the status. Do not pay again."; actions = ["refresh_verification", "contact_business"];
  } else if (!business.settlementAccount?.trim() || !business.settlementBank?.trim()) {
    code = "receiving_account_missing"; text = "The business has not finished configuring its receiving account. Contact the business before paying."; actions = ["contact_business"];
  } else if (state === "mismatch") {
    code = "payment_mismatch"; text = "The receipt could not be matched to this booking's receiving account, exact amount, currency, or a unique transaction. Compare the details below and contact the business if you already paid. Do not pay again just because verification failed.";
  } else if (state === "failed") {
    code = "verification_failed"; text = "We could not verify this receipt. This may be an unclear receipt or a verification service problem; it does not prove payment failed. Upload a clear original receipt or contact the business. Do not pay again without checking.";
  }
  const decision = booking.paymentStatus === "paid" ? "approved"
    : state === "manual_review" ? "manual_review"
    : ["failed", "mismatch"].includes(state) ? "not_verified"
    : ["queued", "verifying"].includes(state) ? "checking" : "not_started";
  return { decision, source: "booking_assistant", code, text, amount: booking.totalAmount, currency: "ETB",
    businessName: business.name, bank: business.settlementBank || null,
    receivingAccount: business.settlementAccount || null, verificationStatus: state,
    bookingStatus: booking.status, paymentStatus: booking.paymentStatus,
    receiptUrl: booking.paymentScreenshotUrl || null, actions };
}
