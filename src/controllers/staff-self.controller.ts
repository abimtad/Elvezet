import { Request, Response } from "express";
import asyncHandler from "../utils/asyncHandler";
import { sendSuccess } from "../utils/httpResponse";
import {
  getMyProfile,
  getMyBookings,
  getMyBookingsCalendar,
  getMyBookingsTimeline,
  getMyStats,
  getMyAvailability,
  setMyAvailability,
  getMyAbsences,
  createMyAbsence,
  deleteMyAbsence,
  completeMyBooking,
  noShowMyBooking,
  startMyBooking,
  toggleMyVisibility,
} from "../services/staff-self.service";

const getFirebaseUid = (req: Request): string => {
  const uid = req.user?.firebaseUid;
  if (!uid) throw new Error("Firebase UID not found in request");
  return uid;
};

// ─── Profile ─────────────────────────────────────────────────

export const getMyProfileController = asyncHandler(
  async (req: Request, res: Response) => {
    const profile = await getMyProfile(getFirebaseUid(req));
    sendSuccess(res, 200, profile);
  },
);

// ─── Bookings ────────────────────────────────────────────────

export const getMyBookingsController = asyncHandler(
  async (req: Request, res: Response) => {
    const { date, status } = req.query as {
      date?: string;
      status?: "today" | "completed" | "pending" | "all";
    };
    
    const result = await getMyBookings(getFirebaseUid(req), { date, status });
    sendSuccess(res, 200, result);
  },
);

export const getMyBookingsCalendarController = asyncHandler(
  async (req: Request, res: Response) => {
    const { month } = req.query as { month?: string };
    const result = await getMyBookingsCalendar(getFirebaseUid(req), month);
    sendSuccess(res, 200, result);
  },
);

export const getMyBookingsTimelineController = asyncHandler(
  async (req: Request, res: Response) => {
    const { date } = req.query as { date?: string };
    if (!date) {
      res.status(400).json({ message: "Date parameter is required" });
      return;
    }
    
    const result = await getMyBookingsTimeline(getFirebaseUid(req), date);
    sendSuccess(res, 200, result);
  },
);

export const completeMyBookingController = asyncHandler(
  async (req: Request, res: Response) => {
    const booking = await completeMyBooking(
      getFirebaseUid(req),
      String(req.params.id),
    );
    sendSuccess(res, 200, booking);
  },
);

export const noShowMyBookingController = asyncHandler(
  async (req: Request, res: Response) => {
    const booking = await noShowMyBooking(
      getFirebaseUid(req),
      String(req.params.id),
    );
    sendSuccess(res, 200, booking);
  },
);

export const startMyBookingController = asyncHandler(
  async (req: Request, res: Response) => {
    const booking = await startMyBooking(
      getFirebaseUid(req),
      String(req.params.id),
    );
    sendSuccess(res, 200, booking);
  },
);

// ─── Stats & Revenue ─────────────────────────────────────────

export const getMyStatsController = asyncHandler(
  async (req: Request, res: Response) => {
    const { from, to, period } = req.query as {
      from?: string;
      to?: string;
      period?: "week" | "month" | "day";
    };
    
    const stats = await getMyStats(getFirebaseUid(req), { from, to, period });
    sendSuccess(res, 200, stats);
  },
);

// ─── Availability ────────────────────────────────────────────

export const getMyAvailabilityController = asyncHandler(
  async (req: Request, res: Response) => {
    const availability = await getMyAvailability(getFirebaseUid(req));
    sendSuccess(res, 200, availability);
  },
);

export const setMyAvailabilityController = asyncHandler(
  async (req: Request, res: Response) => {
    const entries = Array.isArray(req.body) ? req.body : [req.body];
    const availability = await setMyAvailability(getFirebaseUid(req), entries);
    sendSuccess(res, 201, availability);
  },
);

// ─── Absences ────────────────────────────────────────────────

export const getMyAbsencesController = asyncHandler(
  async (req: Request, res: Response) => {
    const { from, to } = req.query as { from?: string; to?: string };
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    
    const absences = await getMyAbsences(getFirebaseUid(req), fromDate, toDate);
    sendSuccess(res, 200, absences);
  },
);

export const createMyAbsenceController = asyncHandler(
  async (req: Request, res: Response) => {
    const profile = await getMyProfile(getFirebaseUid(req));
    const businessId = String(profile.business._id);
    
    const absence = await createMyAbsence(
      getFirebaseUid(req),
      businessId,
      req.body,
    );
    sendSuccess(res, 201, absence);
  },
);

export const deleteMyAbsenceController = asyncHandler(
  async (req: Request, res: Response) => {
    await deleteMyAbsence(getFirebaseUid(req), String(req.params.id));
    res.status(204).send();
  },
);

// ─── Visibility Toggle ───────────────────────────────────────

export const toggleMyVisibilityController = asyncHandler(
  async (req: Request, res: Response) => {
    const { isOnlineVisible } = req.body as { isOnlineVisible: boolean };
    const result = await toggleMyVisibility(getFirebaseUid(req), isOnlineVisible);
    sendSuccess(res, 200, result);
  },
);
