import { Request, Response } from "express";
import asyncHandler from "../utils/asyncHandler";
import {
  createBooking,
  getAvailableSlots,
  listBookingsForUser,
  cancelBooking,
  rescheduleBooking,
  verifyBookingPayment,
  checkoutBooking,
  buildReceiptText,
} from "../services/booking.service";
import { getBookingComputedStatus } from "../services/bookingStatus.service";
import { sendSuccess } from "../utils/httpResponse";
import { uploadBookingScreenshot } from "../services/media.service";
import Booking from "../models/Booking";
import Business from "../models/Business";
import { sendPushToUser } from "../services/notification.service";
import ApiError from "../utils/ApiError";
import { ticketContext } from "../services/booking-ticket.service";
import { getAvailableSlotsRange } from "../services/availability.service";

const withComputedStatus = <
  T extends { startTime: Date; endTime: Date; status: string },
>(
  booking: T,
): T & { computedStatus: string } => {
  const plain =
    typeof (booking as { toObject?: () => Record<string, unknown> })
      .toObject === "function"
      ? ((booking as unknown as { toObject: () => T }).toObject() as T)
      : booking;

  return {
    ...plain,
    computedStatus: getBookingComputedStatus(plain),
  };
};

export const createBookingController = asyncHandler(
  async (req: Request, res: Response) => {
    const booking = await createBooking({ userId: req.user!._id, ...req.body });
    sendSuccess(res, 201, withComputedStatus(booking));
  },
);

export const checkAvailabilityController = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await getAvailableSlots(req.body);
    sendSuccess(res, 200, result);
  },
);

export const checkAvailabilityRangeController = asyncHandler(
  async (req: Request, res: Response) => {
    sendSuccess(res, 200, await getAvailableSlotsRange(req.body));
  },
);

export const listMyBookingsController = asyncHandler(
  async (req: Request, res: Response) => {
    const bookings = await listBookingsForUser(req.user!._id);
    sendSuccess(
      res,
      200,
      bookings.map((booking) => withComputedStatus(booking)),
    );
  },
);

export const cancelBookingController = asyncHandler(
  async (req: Request, res: Response) => {
    const booking = await cancelBooking({
      bookingId: String(req.params.id),
      requester: { _id: req.user!._id, roles: req.user!.roles },
      reason: req.body.reason,
    });
    sendSuccess(res, 200, withComputedStatus(booking));
  },
);

export const rescheduleBookingController = asyncHandler(
  async (req: Request, res: Response) => {
    const booking = await rescheduleBooking({
      bookingId: String(req.params.id),
      requester: { _id: req.user!._id, roles: req.user!.roles },
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      staffId: req.body.staffId,
    });
    sendSuccess(res, 200, withComputedStatus(booking));
  },
);

export const payBookingController = asyncHandler(
  async (req: Request, res: Response) => {
    const booking = await verifyBookingPayment(
      String(req.params.id),
      req.user!._id,
    );
    sendSuccess(res, 200, withComputedStatus(booking));
  },
);

export const confirmPaymentController = payBookingController;

export const checkoutBookingController = asyncHandler(
  async (req: Request, res: Response) => {
    const booking = await checkoutBooking({
      bookingId: String(req.params.id),
      ownerId: req.user!._id,
      products: Array.isArray(req.body.products) ? req.body.products : [],
      priceOverride: req.body.priceOverride,
      paymentMethod: req.body.paymentMethod || "cash",
      tip: req.body.tip,
    });

    sendSuccess(res, 200, withComputedStatus(booking));
  },
);

export const receiptTextController = asyncHandler(
  async (req: Request, res: Response) => {
    const { booking } = await ticketContext(String(req.params.id), req.user!, false);
    if (booking.paymentStatus !== "paid") throw new ApiError(409, "A payment receipt is available only after payment is recorded");
    res.set("Cache-Control", "no-store");
    const receipt = await buildReceiptText(String(req.params.id));
    sendSuccess(res, 200, { receipt });
  },
);

export const uploadPaymentScreenshotController = asyncHandler(
  async (req: Request, res: Response) => {
    const bookingId = String(req.params.id);
    const file = (req as Request & {
      file?: Express.Multer.File;
    }).file;

    if (!file) {
      throw new ApiError(400, "paymentScreenshot file is required");
    }

    const { ensureBookingParticipants, emitChatMessage } = await import("../services/chat.service");
    const context = await ensureBookingParticipants(bookingId, String(req.user!._id), req.user!);
    if (String(context.booking.userId) !== String(req.user!._id) || context.booking.status !== "pending") {
      throw new ApiError(404, "Pending booking not found");
    }
    if (!context.business.settlementAccount?.trim() || !context.business.settlementBank?.trim()) {
      throw new ApiError(409, "This business must configure its payment receiving account and bank before receipt verification");
    }
    if (["queued", "verifying"].includes(context.booking.paymentVerificationStatus || "") && context.booking.verifyEtRequestId) {
      sendSuccess(res, 200, withComputedStatus(context.booking));
      return;
    }

    const screenshotUrl = await uploadBookingScreenshot(file.buffer, bookingId);
    const { startVerifyEtForScreenshot } = await import(
      "../services/bookingPaymentVerify.service"
    );
    // Keep the receipt visible to both participants even if the provider fails.
    await emitChatMessage({ bookingId, senderId: String(req.user!._id), text: "Payment receipt uploaded; verification is not yet complete", image: screenshotUrl }, context);
    const booking = await startVerifyEtForScreenshot({
      bookingId,
      userId: req.user!._id,
      imageBuffer: file.buffer,
      mimeType: file.mimetype || "image/jpeg",
      screenshotUrl,
      context,
    });

    sendSuccess(res, 200, withComputedStatus(booking));
  },
);

export const refreshPaymentVerificationController = asyncHandler(
  async (req: Request, res: Response) => {
    const { refreshVerifyEtStatus } = await import(
      "../services/bookingPaymentVerify.service"
    );
    const bookingId = String(req.params.id);
    const booking = await Booking.findById(bookingId);
    if (!booking) throw new ApiError(404, "Booking not found");

    const business = await Business.findById(booking.businessId).select(
      "ownerId",
    );
    const isOwner =
      business && String(business.ownerId) === String(req.user!._id);
    const isCustomer = String(booking.userId) === String(req.user!._id);
    if (!isOwner && !isCustomer) {
      throw new ApiError(403, "Not allowed");
    }

    const updated = await refreshVerifyEtStatus(bookingId);
    sendSuccess(res, 200, withComputedStatus(updated));
  },
);

/** Chapa removed — Verify.ET is the payment confirmation path. */
export const initializeChapaController = asyncHandler(
  async (_req: Request, res: Response) => {
    throw new ApiError(
      410,
      "Chapa checkout is retired. Upload a payment screenshot for Verify.ET confirmation.",
    );
  },
);

export const verifyChapaController = asyncHandler(
  async (_req: Request, res: Response) => {
    throw new ApiError(
      410,
      "Chapa checkout is retired. Use payment screenshot verification.",
    );
  },
);

export const chapaReturnController = asyncHandler(
  async (_req: Request, res: Response) => {
    res
      .status(410)
      .send(
        "<html><body style='font-family:sans-serif;padding:40px'><h2>Chapa is no longer used</h2><p>Return to BarberOS and upload your bank/Telebirr receipt for automatic verification.</p></body></html>",
      );
  },
);
