import { listStaffByBusiness } from "../services/staff.service";
import asyncHandler from "../utils/asyncHandler";
import { Router } from "express";
import multer from "multer";
import authMiddleware from "../middlewares/auth.middleware";
import requireBusinessOwner from "../middlewares/businessOwner.middleware";
import validate from "../middlewares/validate.middleware";
import {
  dashboardSummaryController,
  listBusinessBookingsController,
  cancelBusinessBookingController,
  createDashboardStaffController,
  updateDashboardStaffController,
  archiveDashboardStaffController,
  setAvailabilityController,
  getAvailabilityController,
  createAbsenceController,
  listAbsencesController,
  deleteAbsenceController,
  createDashboardServiceController,
  updateServiceController,
  deleteServiceController,
  listCustomersController,
  revenueController,
  endOfDayController,
  analyticsController,
  walkInController,
  listProductsController,
  createProductController,
  updateProductController,
  deleteProductController,
  updateBookingStatusController,
  updateBookingAppointmentController,
  searchClientsController,
  getClientHistoryController,
  updateClientNotesController,
  staffStatsController,
  setStaffVisibilityController,
  uploadStaffAvatarController,
  uploadProductImageController,
} from "../controllers/dashboard.controller";
import {
  listBookingsQuerySchema,
  cancelBookingSchema,
  createStaffBodySchema,
  updateStaffBodySchema,
  setAvailabilityBodySchema,
  createAbsenceBodySchema,
  listAbsencesQuerySchema,
  createServiceBodySchema,
  updateServiceBodySchema,
  revenueQuerySchema,
  walkInBodySchema,
  clientSearchQuerySchema,
  createProductBodySchema,
  updateProductBodySchema,
  updateClientNotesBodySchema,
  updateBookingAppointmentBodySchema,
  setStaffVisibilityBodySchema,
} from "../validators/dashboard.validator";

const router = Router({ mergeParams: true });

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, WebP and GIF images are allowed"));
    }
  },
});

// All dashboard routes require auth + business ownership
router.use("/:shopId", authMiddleware, requireBusinessOwner);

// ─── Dashboard Summary ───────────────────────────────────────
router.get("/:shopId/dashboard", dashboardSummaryController);

// ─── Bookings ────────────────────────────────────────────────
router.get(
  "/:shopId/bookings",
  validate(listBookingsQuerySchema, "query"),
  listBusinessBookingsController,
);
router.patch(
  "/:shopId/bookings/:id/cancel",
  validate(cancelBookingSchema),
  cancelBusinessBookingController,
);
router.patch(
  "/:shopId/bookings/:id",
  validate(updateBookingAppointmentBodySchema),
  updateBookingAppointmentController,
);

// ─── Staff ───────────────────────────────────────────────────
router.get("/:shopId/staff", asyncHandler(async (req, res) => {
  res.json({ data: await listStaffByBusiness(String(req.params.shopId), true) });
}));
router.post(
  "/:shopId/staff",
  validate(createStaffBodySchema),
  createDashboardStaffController,
);
router.patch(
  "/:shopId/staff/:id",
  validate(updateStaffBodySchema),
  updateDashboardStaffController,
);
router.patch("/:shopId/staff/:id/archive", archiveDashboardStaffController);
router.get("/:shopId/staff-stats", staffStatsController);
router.patch(
  "/:shopId/staff/:id/visibility",
  validate(setStaffVisibilityBodySchema),
  setStaffVisibilityController,
);
router.post(
  "/:shopId/staff/:id/avatar",
  avatarUpload.single("avatar"),
  uploadStaffAvatarController,
);

// ─── Availability ────────────────────────────────────────────
router.post(
  "/:shopId/staff/:id/availability",
  validate(setAvailabilityBodySchema),
  setAvailabilityController,
);
router.get("/:shopId/staff/:id/availability", getAvailabilityController);

// ─── Absences ────────────────────────────────────────────────
router.post(
  "/:shopId/staff/:id/absences",
  validate(createAbsenceBodySchema),
  createAbsenceController,
);
router.get(
  "/:shopId/staff/:id/absences",
  validate(listAbsencesQuerySchema, "query"),
  listAbsencesController,
);
router.delete(
  "/:shopId/staff/:id/absences/:absenceId",
  deleteAbsenceController,
);

// ─── Services ────────────────────────────────────────────────
router.post(
  "/:shopId/services",
  validate(createServiceBodySchema),
  createDashboardServiceController,
);
router.patch(
  "/:shopId/services/:id",
  validate(updateServiceBodySchema),
  updateServiceController,
);
router.delete("/:shopId/services/:id", deleteServiceController);

// ─── Customers ───────────────────────────────────────────────
router.get("/:shopId/customers", listCustomersController);

// ─── Revenue ─────────────────────────────────────────────────
router.get(
  "/:shopId/revenue",
  validate(revenueQuerySchema, "query"),
  revenueController,
);

router.get(
  "/:shopId/end-of-day",
  validate(revenueQuerySchema, "query"),
  endOfDayController,
);

router.get(
  "/:shopId/analytics",
  validate(revenueQuerySchema, "query"),
  analyticsController,
);

router.post(
  "/:shopId/walk-in",
  validate(walkInBodySchema),
  walkInController,
);

router.get("/:shopId/products", listProductsController);
router.post(
  "/:shopId/products/upload-image",
  avatarUpload.single("image"),
  uploadProductImageController,
);
router.post(
  "/:shopId/products",
  validate(createProductBodySchema),
  createProductController,
);
router.patch(
  "/:shopId/products/:id",
  validate(updateProductBodySchema),
  updateProductController,
);
router.delete("/:shopId/products/:id", deleteProductController);

router.patch("/:shopId/bookings/:id/status", updateBookingStatusController);

router.get(
  "/:shopId/clients/search",
  validate(clientSearchQuerySchema, "query"),
  searchClientsController,
);

router.get(
  "/:shopId/clients/:id/history",
  getClientHistoryController,
);

router.patch(
  "/:shopId/clients/:id/notes",
  validate(updateClientNotesBodySchema),
  updateClientNotesController,
);

export default router;
