import { recordPaymentDecision } from "./booking-payment-messages.service";
import { Types } from "mongoose";
import { createHash } from "crypto";
import Booking, { IBooking } from "../models/Booking";
import Business, { IBusiness } from "../models/Business";
import ApiError from "../utils/ApiError";
import { notifyBookingEvent } from "./booking-notifications.service";
import {
  getVerificationStatus,
  isSettlementMatched,
  isVerificationSuccessful,
  submitReceiptImage,
} from "./verifyEt.service";
import { sendPushToUser } from "./notification.service";
import { emitBookingEvent } from "./realtime.service";

export type PaymentVerificationStatus =
  | "none"
  | "queued"
  | "verifying"
  | "verified"
  | "failed"
  | "mismatch"
  | "manual_review";

const markPaidAndConfirmed = async (booking: IBooking): Promise<IBooking> => {
  const confirmed = await Booking.findOneAndUpdate({ _id: booking._id, status: "pending", paymentStatus: "unpaid", verifyEtRequestId: booking.verifyEtRequestId }, { $set: { status: "confirmed", paymentStatus: "paid", paidAt: new Date(), paymentVerificationStatus: "verified", verifiedTransactionKey: booking.verifiedTransactionKey, verifyEtResult: booking.verifyEtResult }, $addToSet: { notificationEvents: "booking_confirmed" } }, { new: true });
  if (!confirmed) throw new ApiError(409, "Booking changed while verifying payment. Refresh its status");
  booking = confirmed;
  emitBookingEvent("booking:updated", booking);
  // The persisted booking_confirmed event is retried by notification recovery.
  // Push/SMS delivery must not delay returning a verified booking to the customer.
  void notifyBookingEvent(String(booking._id), "booking_confirmed").catch(() => undefined);
  return booking;
};

/** Apply a finished Verify.ET payload to a booking. */
const applyVerifyEtResult = async (
  bookingId: string,
  verification: Record<string, unknown>,
): Promise<IBooking> => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");
  if (verification.requestId && String(verification.requestId) !== booking.verifyEtRequestId) return booking;

  if (booking.paymentStatus === "paid") return booking;

  booking.verifyEtResult = verification;
  booking.verifyEtCheckedAt = new Date();

  const success = isVerificationSuccessful(verification);
  const settlement = isSettlementMatched(verification);

  if (["queued", "running", "processing", "pending"].includes(String(verification.processingStatus || verification.status))) {
    if (booking.status === "pending") {
      booking.paymentVerificationStatus = "queued";
      await booking.save();
    }
    return booking;
  }

  if (booking.paymentVerificationStatus === "manual_review" || booking.notificationEvents?.includes("payment_verification_manual_review")) return booking;

  if (!success) {
    booking.paymentVerificationStatus = "failed";
    await booking.save();
    await recordPaymentDecision(booking);
    emitBookingEvent("booking:updated", booking);
    return booking;
  }

  const amount = Number(verification.amount);
  const reference = String(verification.receiptNumber || verification.referenceNumber || verification.transactionNumber || "").trim();
  const bank = String(verification.bank || "").toLowerCase();
  if (settlement !== true || !Number.isFinite(amount) || Math.round(amount * 100) !== Math.round(booking.totalAmount * 100) || String(verification.currency || "").toUpperCase() !== "ETB" || !reference || !bank) {
    booking.paymentVerificationStatus = "mismatch";
    await booking.save();
    emitBookingEvent("booking:updated", booking);

    const business = await Business.findById(booking.businessId).select(
      "ownerId",
    );
    if (business?.ownerId) {
      void sendPushToUser(String(business.ownerId), {
        notification: {
          title: "Payment account mismatch",
          body: "A receipt was verified but the money may not match your settlement account. Review the booking.",
        },
        data: {
          bookingId: String(booking._id),
          type: "payment_verification_mismatch",
        },
      }).catch(() => undefined);
    }
    return booking;
  }

  booking.verifiedTransactionKey = `${bank}:${reference}`;
  if (await Booking.exists({ _id: { $ne: booking._id }, verifiedTransactionKey: booking.verifiedTransactionKey })) {
    booking.paymentVerificationStatus = "mismatch";
    booking.verifiedTransactionKey = undefined;
    await booking.save();
    return booking;
  }
  if (booking.status !== "pending") {
    // Reserve the transaction and claim the alert atomically across repeated callbacks.
    let reviewed;
    try {
      reviewed = await Booking.findOneAndUpdate({
        _id: booking._id, status: booking.status, paymentStatus: "unpaid",
        paymentVerificationStatus: { $ne: "manual_review" },
        notificationEvents: { $ne: "payment_verification_manual_review" },
        verifyEtRequestId: booking.verifyEtRequestId,
      }, { $set: {
        paymentVerificationStatus: "manual_review", verifiedTransactionKey: booking.verifiedTransactionKey,
        verifyEtResult: verification, verifyEtCheckedAt: new Date(),
      }, $addToSet: { notificationEvents: "payment_verification_manual_review" } }, { new: true });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      await Booking.updateOne({ _id: booking._id, paymentVerificationStatus: { $ne: "manual_review" } }, { $set: { paymentVerificationStatus: "mismatch" } });
      return (await Booking.findById(booking._id))!;
    }
    if (!reviewed) return (await Booking.findById(booking._id))!;
    emitBookingEvent("booking:updated", reviewed);
    const business = await Business.findById(reviewed.businessId).select("ownerId");
    if (business?.ownerId) {
      void sendPushToUser(String(business.ownerId), {
        notification: { title: "Late payment needs review", body: "A matching payment arrived after the booking was no longer pending. Review before taking action." },
        data: { bookingId: String(reviewed._id), type: "payment_verification_manual_review" },
      }).catch(() => undefined);
    }
    return reviewed;
  }
  return markPaidAndConfirmed(booking);
};

export const applyVerifyEtResultToBooking = async (bookingId: string, verification: Record<string, unknown>): Promise<IBooking> => {
  const booking = await applyVerifyEtResult(bookingId, verification);
  await recordPaymentDecision(booking);
  return booking;
};

/** After screenshot upload: store file URL then submit to Verify.ET. */
export const startVerifyEtForScreenshot = async (input: {
  bookingId: string;
  userId: Types.ObjectId | string;
  imageBuffer: Buffer;
  mimeType: string;
  screenshotUrl: string;
  context?: { booking: IBooking; business: IBusiness };
}): Promise<IBooking> => {
  let booking = input.context?.booking || await Booking.findById(input.bookingId);
  if (!booking || String(booking._id) !== input.bookingId) throw new ApiError(404, "Booking not found");

  if (String(booking.userId) !== String(input.userId)) {
    throw new ApiError(403, "Not allowed to upload screenshot for this booking");
  }
  if (booking.status !== "pending") {
    throw new ApiError(
      400,
      "Screenshot can only be uploaded for pending bookings",
    );
  }
  if (booking.paymentStatus === "paid" || ["queued", "verifying", "manual_review"].includes(booking.paymentVerificationStatus || "")) return booking;

  const business = input.context?.business || await Business.findById(booking.businessId);
  const settlementAccount =
    business?.settlementAccount?.trim() || undefined;
  if (!settlementAccount) {
    booking.paymentVerificationStatus = "failed";
    await booking.save();
    throw new ApiError(409, "This business must configure its payment receiving account before receipt verification");
  }
  const bank = business?.settlementBank?.trim() || undefined;
  const claimed = await Booking.findOneAndUpdate({ _id: booking._id, userId: String(input.userId), status: "pending", paymentStatus: "unpaid",
    paymentVerificationStatus: { $nin: ["queued", "verifying", "verified", "manual_review"] } },
    { $set: { paymentScreenshotUrl: input.screenshotUrl, paymentVerificationStatus: "verifying" },
      $unset: { verifyEtRequestId: 1, verifyEtResult: 1 } }, { returnDocument: "after" });
  if (!claimed) return (await Booking.findById(booking._id))!;
  booking = claimed;


  try {
    const result = await submitReceiptImage({
      imageBuffer: input.imageBuffer,
      mimeType: input.mimeType,
      fileName: `booking-${input.bookingId}.jpg`,
      idempotencyKey: `booking-${input.bookingId}-${createHash("sha256").update(input.imageBuffer).update(settlementAccount).update(bank || "").digest("hex")}`,
      settlementAccount,
      bank,
      waitMs: 0,
    });

    const accepted = await Booking.findOneAndUpdate({ _id: booking._id, paymentStatus: "unpaid",
      paymentScreenshotUrl: input.screenshotUrl, paymentVerificationStatus: "verifying" },
      { $set: { verifyEtRequestId: result.requestId,
        paymentVerificationStatus: result.completedInline ? "verifying" : "queued" } }, { returnDocument: "after" });
    if (!accepted) return (await Booking.findById(booking._id))!;
    booking = accepted;

    if (business?.ownerId) {
      void sendPushToUser(String(business.ownerId), {
        notification: {
          title: "Payment receipt received",
          body: "Verify.ET is checking the payment screenshot.",
        },
        data: {
          bookingId: String(booking._id),
          type: "payment_screenshot_received",
          requestId: result.requestId,
        },
      }).catch(() => undefined);
    }

    if (result.completedInline && result.verification) {
      return applyVerifyEtResultToBooking(
        String(booking._id),
        result.verification,
      );
    }

    emitBookingEvent("booking:updated", booking);
    return booking;
  } catch (error) {
    // A late transport failure must not overwrite a concurrently approved payment.
    const failed = await Booking.findOneAndUpdate({ _id: booking._id, paymentStatus: "unpaid", paymentScreenshotUrl: input.screenshotUrl,
      paymentVerificationStatus: { $nin: ["verified", "manual_review"] } },
      { $set: { paymentVerificationStatus: "failed" } }, { returnDocument: "after" });
    if (failed) {
      await recordPaymentDecision(failed);
      emitBookingEvent("booking:updated", failed);
    }
    throw error;
  }
};

const fetchVerifyEtStatus = async (
  bookingId: string,
): Promise<IBooking> => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");
  if (!booking.verifyEtRequestId) {
    throw new ApiError(400, "No Verify.ET request for this booking");
  }
  if (booking.paymentStatus === "paid") return booking;

  const statusBody = await getVerificationStatus(booking.verifyEtRequestId);
  const verification = statusBody;
  return applyVerifyEtResultToBooking(bookingId, verification);
};

const refreshes = new Map<string, Promise<IBooking>>();
export const refreshVerifyEtStatus = (bookingId: string): Promise<IBooking> => {
  const existing = refreshes.get(bookingId);
  if (existing) return existing;
  const pending = fetchVerifyEtStatus(bookingId).finally(() => refreshes.delete(bookingId));
  refreshes.set(bookingId, pending);
  return pending;
};

export const startPaymentVerificationRecovery = (): void => {
  let running = false;
  let lastExpirySweep = 0;
  const recover = async () => {
    if (running) return;
    running = true;
    try {
      const bookings = await Booking.find({ status: "pending", paymentStatus: "unpaid", verifyEtRequestId: { $exists: true }, paymentVerificationStatus: { $in: ["queued", "verifying"] } }).sort({ verifyEtCheckedAt: 1 }).limit(20).select("_id");
      for (let offset = 0; offset < bookings.length; offset += 4) {
        await Promise.all(bookings.slice(offset, offset + 4).map(async booking => {
          try { await refreshVerifyEtStatus(String(booking._id)); } catch {
            await Booking.updateOne({ _id: booking._id, paymentStatus: "unpaid" }, { $set: { verifyEtCheckedAt: new Date() } });
          }
        }));
      }
      const now = Date.now();
      if (now - lastExpirySweep < 60000) return;
      lastExpirySweep = now;
      await Booking.updateMany({ status: "pending", paymentStatus: "unpaid", $or: [{ paymentScreenshotUrl: { $exists: false }, createdAt: { $lt: new Date(now - 10 * 60000) } }, { createdAt: { $lt: new Date(now - 2 * 3600000) } }] }, { $set: { status: "expired" } });
    } finally { running = false; }
  };
  const timer = setInterval(() => { void recover().catch(() => console.warn("Payment verification recovery deferred")); }, 5000);
  timer.unref();
};
