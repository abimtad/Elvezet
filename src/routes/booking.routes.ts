import { Router } from "express";
import bookingChat from "./booking-chat.routes";
import bookingTickets from "./booking-ticket.routes";
import {
  checkAvailabilityController,
  checkAvailabilityRangeController,
  createBookingController,
  cancelBookingController,
  confirmPaymentController,
  uploadPaymentScreenshotController,
  payBookingController,
  checkoutBookingController,
  receiptTextController,
  rescheduleBookingController,
  initializeChapaController,
  verifyChapaController,
  chapaReturnController,
  refreshPaymentVerificationController,
  listMyBookingsController,
} from "../controllers/booking.controller";
import authMiddleware from "../middlewares/auth.middleware";
import { parseBookingScreenshotUpload } from "../middlewares/bookingScreenshot.middleware";
import validate from "../middlewares/validate.middleware";
import {
  checkAvailabilitySchema,
  checkAvailabilityRangeSchema,
  cancelBookingSchema,
  createBookingSchema,
  payBookingSchema,
  checkoutBookingSchema,
  rescheduleBookingSchema,
} from "../validators/booking.validator";

const router = Router();
router.use(bookingTickets);
router.use(bookingChat);

router.post('/availability/range', validate(checkAvailabilityRangeSchema), checkAvailabilityRangeController);

router.post(
  "/availability/check",
  validate(checkAvailabilitySchema),
  checkAvailabilityController,
);

router.get("/mine", authMiddleware, listMyBookingsController);

router.post(
  "/",
  authMiddleware,
  validate(createBookingSchema),
  createBookingController,
);
router.patch(
  "/:id/cancel",
  authMiddleware,
  validate(cancelBookingSchema),
  cancelBookingController,
);

router.patch(
  "/:id/reschedule",
  authMiddleware,
  validate(rescheduleBookingSchema),
  rescheduleBookingController,
);

router.post(
  "/:id/pay",
  authMiddleware,
  validate(payBookingSchema),
  payBookingController,
);

router.patch(
  "/:id/upload-screenshot",
  authMiddleware,
  parseBookingScreenshotUpload,
  uploadPaymentScreenshotController,
);

router.post(
  "/:id/payment-verification/refresh",
  authMiddleware,
  refreshPaymentVerificationController,
);

router.patch(
  "/:id/confirm-payment",
  authMiddleware,
  validate(payBookingSchema),
  confirmPaymentController,
);

router.patch(
  "/:id/checkout",
  authMiddleware,
  validate(checkoutBookingSchema),
  checkoutBookingController,
);

router.get("/:id/chapa/return", chapaReturnController);

router.post(
  "/:id/chapa/initialize",
  authMiddleware,
  initializeChapaController,
);

router.post(
  "/:id/chapa/verify",
  authMiddleware,
  verifyChapaController,
);

router.get("/:id/receipt", authMiddleware, receiptTextController);

export default router;
