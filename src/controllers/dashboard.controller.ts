import { Request, Response } from "express";
import asyncHandler from "../utils/asyncHandler";
import {
  getDashboardSummary,
  listBusinessBookings,
  cancelBusinessBooking,
  createDashboardStaff,
  updateDashboardStaff,
  archiveDashboardStaff,
  setStaffAvailabilityBatch,
  getStaffAvailability,
  createStaffAbsence,
  listStaffAbsences,
  deleteStaffAbsence,
  updateBusinessService,
  deleteBusinessService,
  listBusinessCustomers,
  getBusinessRevenue,
  getEndOfDayReport,
  getBusinessAnalytics,
  listBusinessProducts,
  createBusinessProduct,
  updateBusinessProduct,
  deleteBusinessProduct,
  searchBusinessClients,
  getClientHistory,
  updateClientNotes,
  getStaffStats,
  setStaffOnlineVisibility,
} from "../services/dashboard.service";
import {
  createWalkInBooking,
  buildReceiptText,
  updateBookingAppointment,
} from "../services/booking.service";
import { getBookingComputedStatus } from "../services/bookingStatus.service";
import { createService } from "../services/service.service";
import { sendSuccess } from "../utils/httpResponse";
import { toPublicUrl, uploadAndCompressImage } from "../services/media.service";
import { deleteLocalFile } from "../services/media.service";

const param = (val: string | string[] | undefined): string => String(val ?? "");

const withComputedStatus = <
  T extends { startTime: Date; endTime: Date; status: string },
>(
  booking: T,
): T & { computedStatus: string } => ({
  ...booking,
  computedStatus: getBookingComputedStatus(booking),
});

// ─── Dashboard Summary ───────────────────────────────────────

export const dashboardSummaryController = asyncHandler(
  async (req: Request, res: Response) => {
    const summary = await getDashboardSummary(param(req.params.shopId));
    sendSuccess(res, 200, summary);
  },
);

// ─── Bookings ────────────────────────────────────────────────

export const listBusinessBookingsController = asyncHandler(
  async (req: Request, res: Response) => {
    const { date, status, staffId, page, limit } = req.query as Record<
      string,
      string
    >;
    const result = await listBusinessBookings({
      businessId: param(req.params.shopId),
      date: date ? new Date(date) : undefined,
      status,
      staffId,
      page: Number(page) || 1,
      limit: Number(limit) || 50,
    });
    sendSuccess(res, 200, result);
  },
);

export const cancelBusinessBookingController = asyncHandler(
  async (req: Request, res: Response) => {
    const booking = await cancelBusinessBooking(
      param(req.params.id),
      param(req.params.shopId),
      req.user!._id,
      req.body.reason || req.body.cancellationReason,
    );
    sendSuccess(res, 200, withComputedStatus(booking.toObject()));
  },
);

export const updateBookingAppointmentController = asyncHandler(
  async (req: Request, res: Response) => {
    const booking = await updateBookingAppointment({
      bookingId: param(req.params.id),
      businessId: param(req.params.shopId),
      ownerId: req.user!._id,
      appointmentNotes: req.body.appointmentNotes,
      serviceIds: req.body.serviceIds,
      tipAmount: req.body.tipAmount,
    });
    sendSuccess(res, 200, withComputedStatus(booking.toObject()));
  },
);

// ─── Staff ───────────────────────────────────────────────────

export const uploadStaffAvatarController = asyncHandler(
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: "No image file provided" });
      return;
    }

    const staffId = param(req.params.id);
    const businessId = param(req.params.shopId);
    const StaffProfile = (await import("../models/StaffProfile")).default;
    const existingProfile = await StaffProfile.findOne({ staffId, businessId }).select(
      "profilePicture",
    );

    if (
      existingProfile?.profilePicture &&
      existingProfile.profilePicture.startsWith("/uploads/")
    ) {
      await deleteLocalFile(existingProfile.profilePicture);
    }

    const imagePath = await uploadAndCompressImage(file.buffer, "avatars");
    const imageUrl = toPublicUrl(imagePath);

    // Save the URL to the StaffProfile
    const profile = await StaffProfile.findOneAndUpdate(
      { staffId, businessId },
      { profilePicture: imagePath },
      { new: true },
    );

    if (!profile) {
      res.status(404).json({ message: "Staff profile not found" });
      return;
    }

    sendSuccess(res, 200, { profilePicture: imageUrl });
  },
);

export const createDashboardStaffController = asyncHandler(
  async (req: Request, res: Response) => {
    const staff = await createDashboardStaff({
      ownerId: req.user!._id,
      businessId: param(req.params.shopId),
      ...req.body,
    });
    sendSuccess(res, 201, staff);
  },
);

export const updateDashboardStaffController = asyncHandler(
  async (req: Request, res: Response) => {
    const staff = await updateDashboardStaff(
      param(req.params.id),
      param(req.params.shopId),
      req.body,
    );
    sendSuccess(res, 200, staff);
  },
);

export const archiveDashboardStaffController = asyncHandler(
  async (req: Request, res: Response) => {
    const staff = await archiveDashboardStaff(
      param(req.params.id),
      param(req.params.shopId),
    );
    sendSuccess(res, 200, staff);
  },
);

// ─── Availability ────────────────────────────────────────────

export const setAvailabilityController = asyncHandler(
  async (req: Request, res: Response) => {
    const entries = Array.isArray(req.body) ? req.body : [req.body];
    const availability = await setStaffAvailabilityBatch(
      param(req.params.id),
      param(req.params.shopId),
      entries,
    );
    sendSuccess(res, 201, availability);
  },
);

export const getAvailabilityController = asyncHandler(
  async (req: Request, res: Response) => {
    const availability = await getStaffAvailability(
      param(req.params.id),
      param(req.params.shopId),
    );
    sendSuccess(res, 200, availability);
  },
);

// ─── Absences ────────────────────────────────────────────────

export const createAbsenceController = asyncHandler(
  async (req: Request, res: Response) => {
    const absence = await createStaffAbsence(
      param(req.params.id),
      param(req.params.shopId),
      req.body,
    );
    sendSuccess(res, 201, absence);
  },
);

export const listAbsencesController = asyncHandler(
  async (req: Request, res: Response) => {
    const { from, to } = req.query as Record<string, string>;
    const absences = await listStaffAbsences(
      param(req.params.id),
      param(req.params.shopId),
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
    sendSuccess(res, 200, absences);
  },
);

export const deleteAbsenceController = asyncHandler(
  async (req: Request, res: Response) => {
    await deleteStaffAbsence(
      param(req.params.absenceId),
      param(req.params.id),
      param(req.params.shopId),
    );
    res.status(204).send();
  },
);

// ─── Services ────────────────────────────────────────────────

export const createDashboardServiceController = asyncHandler(
  async (req: Request, res: Response) => {
    const service = await createService({
      ownerId: req.user!._id,
      businessId: param(req.params.shopId),
      ...req.body,
    });
    sendSuccess(res, 201, service);
  },
);

export const updateServiceController = asyncHandler(
  async (req: Request, res: Response) => {
    const service = await updateBusinessService(
      param(req.params.id),
      param(req.params.shopId),
      req.body,
    );
    sendSuccess(res, 200, service);
  },
);

export const deleteServiceController = asyncHandler(
  async (req: Request, res: Response) => {
    await deleteBusinessService(param(req.params.id), param(req.params.shopId));
    res.status(204).send();
  },
);

// ─── Customers ───────────────────────────────────────────────

export const listCustomersController = asyncHandler(
  async (req: Request, res: Response) => {
    const customers = await listBusinessCustomers(param(req.params.shopId));
    sendSuccess(res, 200, customers);
  },
);

// ─── Revenue ─────────────────────────────────────────────────

export const revenueController = asyncHandler(
  async (req: Request, res: Response) => {
    const { range, date } = req.query as Record<string, string>;
    const revenue = await getBusinessRevenue(
      param(req.params.shopId),
      (range as "day" | "week" | "month") || "day",
      date ? new Date(date) : undefined,
    );
    sendSuccess(res, 200, revenue);
  },
);

export const endOfDayController = asyncHandler(
  async (req: Request, res: Response) => {
    const { date } = req.query as Record<string, string>;
    const report = await getEndOfDayReport(
      param(req.params.shopId),
      date ? new Date(date) : new Date(),
    );
    sendSuccess(res, 200, report);
  },
);

export const analyticsController = asyncHandler(
  async (req: Request, res: Response) => {
    const { range, date } = req.query as Record<string, string>;
    const analytics = await getBusinessAnalytics(
      param(req.params.shopId),
      (range as "day" | "week" | "month") || "week",
      date ? new Date(date) : undefined,
    );
    sendSuccess(res, 200, analytics);
  },
);

export const walkInController = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = req.body as {
      serviceIds: string[];
      staffPlan: Array<{
        staffId: string;
        serviceId: string;
        startTime: string;
        endTime: string;
      }>;
      startTime: string;
      endTime: string;
      phoneNumber: string;
      fullName?: string;
      email?: string;
      notes?: string;
      paymentMethod?: "cash" | "in-shop";
      userLat?: number;
      userLng?: number;
    };

    // Walk-ins are placed directly on the calendar; skip online slot discovery.
    const booking = await createWalkInBooking({
      businessId: param(req.params.shopId),
      ...payload,
    });

    await booking.populate([
      { path: "clientId", select: "fullName phoneNumber email" },
      {
        path: "serviceIds",
        select: "name duration basePrice category categoryName",
      },
      { path: "serviceId", select: "name duration basePrice category categoryName" },
    ]);

    sendSuccess(res, 201, withComputedStatus(booking.toObject()));
  },
);

export const listProductsController = asyncHandler(
  async (req: Request, res: Response) => {
    const products = await listBusinessProducts(param(req.params.shopId));
    sendSuccess(res, 200, products);
  },
);

export const createProductController = asyncHandler(
  async (req: Request, res: Response) => {
    const product = await createBusinessProduct(param(req.params.shopId), req.body);
    sendSuccess(res, 201, product);
  },
);

export const updateProductController = asyncHandler(
  async (req: Request, res: Response) => {
    const product = await updateBusinessProduct(
      param(req.params.id),
      param(req.params.shopId),
      req.body,
    );
    sendSuccess(res, 200, product);
  },
);

export const deleteProductController = asyncHandler(
  async (req: Request, res: Response) => {
    await deleteBusinessProduct(param(req.params.id), param(req.params.shopId));
    res.status(204).send();
  },
);

export const uploadProductImageController = asyncHandler(
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: "No image file provided" });
      return;
    }
    const imagePath = await uploadAndCompressImage(
      file.buffer,
      `products/${param(req.params.shopId)}`,
    );
    sendSuccess(res, 200, {
      imageUrl: imagePath,
      publicUrl: toPublicUrl(imagePath),
    });
  },
);

export const updateBookingStatusController = asyncHandler(
  async (req: Request, res: Response) => {
    const booking = await import("../models/Booking").then((m) => m.default.findById(param(req.params.id)));
    if (!booking) throw Object.assign(new Error("Booking not found"), { statusCode: 404 });
    if (String(booking.businessId) !== param(req.params.shopId)) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    const nextStatus = String(req.body.status || "");
    const transitions: Record<string, string[]> = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["completed", "cancelled", "no_show", "no-show"],
    };
    if (nextStatus !== booking.status && !transitions[booking.status]?.includes(nextStatus)) {
      throw Object.assign(new Error("This booking status transition is not allowed"), { statusCode: 409 });
    }
    if (nextStatus === "completed" && booking.startTime > new Date()) throw Object.assign(new Error("Cannot complete a future appointment"), { statusCode: 400 });
    if (booking.completedAt && nextStatus !== "completed") throw Object.assign(new Error("This appointment is already completed"), { statusCode: 409 });
    if (
      ["confirmed", "completed"].includes(nextStatus) &&
      !booking.isWalkIn &&
      booking.paymentStatus !== "paid"
    ) {
      throw Object.assign(
        new Error(
          "Verify the payment receipt or complete checkout before confirming this booking",
        ),
        { statusCode: 409 },
      );
    }
    const Booking = (await import("../models/Booking")).default;
    const updated = await Booking.findOneAndUpdate(
      { _id: booking._id, status: booking.status, paymentStatus: booking.paymentStatus, completedAt: booking.completedAt ?? null },
      { $set: nextStatus === "completed" ? { status: "confirmed", completedAt: booking.completedAt || new Date() } : { status: nextStatus } }, { new: true },
    );
    if (!updated) throw Object.assign(new Error("Booking changed. Refresh and try again"), { statusCode: 409 });
    sendSuccess(res, 200, withComputedStatus(updated.toObject()));
  },
);

export const getClientHistoryController = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await getClientHistory(
      param(req.params.id),
      param(req.params.shopId),
    );
    sendSuccess(res, 200, result);
  },
);

export const updateClientNotesController = asyncHandler(
  async (req: Request, res: Response) => {
    const client = await updateClientNotes(
      param(req.params.id),
      param(req.params.shopId),
      String(req.body.notes ?? ""),
    );
    sendSuccess(res, 200, client);
  },
);

export const searchClientsController = asyncHandler(
  async (req: Request, res: Response) => {
    const { query } = req.query as Record<string, string>;
    const clients = await searchBusinessClients(param(req.params.shopId), query);
    sendSuccess(res, 200, clients);
  },
);

export const receiptController = asyncHandler(
  async (req: Request, res: Response) => {
    const { bookingId } = req.params as { bookingId: string };
    const receipt = await buildReceiptText(bookingId);
    sendSuccess(res, 200, { receipt });
  },
);

export const staffStatsController = asyncHandler(
  async (req: Request, res: Response) => {
    const stats = await getStaffStats(param(req.params.shopId));
    sendSuccess(res, 200, { staff: stats });
  },
);

export const setStaffVisibilityController = asyncHandler(
  async (req: Request, res: Response) => {
    const profile = await setStaffOnlineVisibility(
      param(req.params.id),
      param(req.params.shopId),
      Boolean(req.body.isOnlineVisible),
    );
    sendSuccess(res, 200, profile);
  },
);
