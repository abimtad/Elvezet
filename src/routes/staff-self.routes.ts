import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware";
import requireRole from "../middlewares/role.middleware";
import validate from "../middlewares/validate.middleware";
import {
  getMyProfileController,
  getMyBookingsController,
  getMyBookingsCalendarController,
  getMyBookingsTimelineController,
  getMyStatsController,
  getMyAvailabilityController,
  setMyAvailabilityController,
  getMyAbsencesController,
  createMyAbsenceController,
  deleteMyAbsenceController,
  completeMyBookingController,
  noShowMyBookingController,
  startMyBookingController,
  toggleMyVisibilityController,
} from "../controllers/staff-self.controller";
import {
  getMyBookingsQuerySchema,
  getMyStatsQuerySchema,
  setMyAvailabilityBodySchema,
  createMyAbsenceBodySchema,
  toggleMyVisibilityBodySchema,
} from "../validators/staff-self.validator";

const router = Router();

// All routes require authentication + staff/owner role
router.use(authMiddleware, requireRole("staff", "owner"));

// ─── Profile ─────────────────────────────────────────────────
router.get("/profile", getMyProfileController);

// ─── Bookings ────────────────────────────────────────────────
router.get(
  "/bookings",
  validate(getMyBookingsQuerySchema, "query"),
  getMyBookingsController,
);

router.get(
  "/bookings/calendar",
  validate(getMyBookingsQuerySchema, "query"),
  getMyBookingsCalendarController,
);

router.get(
  "/bookings/timeline",
  validate(getMyBookingsQuerySchema, "query"),
  getMyBookingsTimelineController,
);

router.patch("/bookings/:id/complete", completeMyBookingController);
router.patch("/bookings/:id/no-show", noShowMyBookingController);
router.patch("/bookings/:id/start", startMyBookingController);

// ─── Stats & Revenue ─────────────────────────────────────────
router.get(
  "/stats",
  validate(getMyStatsQuerySchema, "query"),
  getMyStatsController,
);

// ─── Availability ────────────────────────────────────────────
router.get("/availability", getMyAvailabilityController);
router.post(
  "/availability",
  validate(setMyAvailabilityBodySchema),
  setMyAvailabilityController,
);

// ─── Absences ────────────────────────────────────────────────
router.get(
  "/absences",
  validate(getMyBookingsQuerySchema, "query"),
  getMyAbsencesController,
);
router.post(
  "/absences",
  validate(createMyAbsenceBodySchema),
  createMyAbsenceController,
);
router.delete("/absences/:id", deleteMyAbsenceController);

// ─── Visibility Toggle ───────────────────────────────────────
router.patch(
  "/visibility",
  validate(toggleMyVisibilityBodySchema),
  toggleMyVisibilityController,
);

export default router;
