import Message from "../models/Message";
import { IBooking } from "../models/Booking";
/** Persist the decision once so reconnects and both sides see the same result. */
export async function recordPaymentDecision(booking: IBooking) {
  const state = booking.paymentStatus === "paid" ? "approved" : booking.paymentVerificationStatus;
  const decisions: Record<string, { code: string; text: string }> = {
    approved: {code:"payment_approved", text: booking.status === "confirmed" ? "Your payment has been approved and your appointment is confirmed." : "Your payment has been approved. Check your booking status before attending."},
    failed: {code:"payment_not_verified", text:"Your receipt was not approved: payment could not be verified. Upload a clear original receipt or contact the business. Do not pay again without checking."},
    mismatch: {code:"payment_not_verified", text:"Your receipt was not approved for this booking. The account, amount, currency or transaction reference could not be matched. Contact the business if you already paid; do not send another payment without checking."},
    manual_review: {code:"payment_review", text:"Your payment needs business review. Do not pay again. Contact the business about this booking."},
  };
  const decision = decisions[String(state)];
  if (!decision) return;
  const assistantEventKey = `${booking._id}:${booking.verifyEtRequestId || booking.paymentScreenshotUrl || "payment"}:${state}`;
  try { await Message.updateOne({assistantEventKey}, {$setOnInsert:{bookingId:booking._id,senderId:"booking-assistant",senderType:"assistant",assistantCode:decision.code,text:decision.text,assistantEventKey}}, {upsert:true}); } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}
