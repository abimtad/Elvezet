import { Router } from "express";
import { registerDeviceTokenController } from "../controllers/user.controller";
import authMiddleware from "../middlewares/auth.middleware";
import validate from "../middlewares/validate.middleware";
import { registerTokenSchema } from "../validators/user.validator";
import { listMyBookingsController } from "../controllers/booking.controller";
import User from "../models/User";
import DeviceToken from "../models/DeviceToken";
import ContentReport from "../models/ContentReport";
import AccountDeletion from "../models/AccountDeletion";
import { requestAccountDeletion } from "../services/account-deletion.service";
import { reportContent, blockUser, contentTarget, resolveContentReport } from "../services/content-safety.service";
import requireModerator from "../middlewares/moderator.middleware";
import requireAdmin from "../middlewares/admin.middleware";
import asyncHandler from "../utils/asyncHandler";
import ApiError from "../utils/ApiError";
import { httpLimit } from '../middlewares/traffic.middleware';
import { policies } from '../services/traffic-limit.service';
import { Types } from "mongoose";
import { Joi } from "../validators/common";
import { listCustomerTicketArchive, ArchiveQuery } from "../services/customer-ticket-archive.service";

const router = Router();

router.post("/users/me/community-guidelines", authMiddleware, asyncHandler(async (req, res) => {
  if (req.body.accepted !== true) throw new ApiError(400, "Accept the community guidelines");
  await User.updateOne({ _id: req.user!._id }, { communityGuidelinesAcceptedAt: new Date() });
  res.sendStatus(204);
}));

router.get("/users/me/notification-preferences", authMiddleware, asyncHandler(async (req, res) => {
  const prefs = req.user!.notificationPreferences;
  res.json({ bookingUpdates: prefs?.bookingUpdates ?? true, appointmentReminders: prefs?.appointmentReminders ?? true, marketing: prefs?.marketing ?? false });
}));
router.patch("/users/me/notification-preferences", authMiddleware, asyncHandler(async (req, res) => {
  const updates: Record<string, boolean> = {};
  for (const key of Object.keys(req.body)) {
    if (!["bookingUpdates", "appointmentReminders", "marketing"].includes(key) || typeof req.body[key] !== "boolean") {
      throw new ApiError(400, "Invalid notification preference");
    }
    updates[`notificationPreferences.${key}`] = req.body[key];
  }
  if (!Object.keys(updates).length) throw new ApiError(400, "Choose a notification preference");
  const user = await User.findByIdAndUpdate(req.user!._id, { $set: updates }, { new: true });
  res.json(user!.notificationPreferences);
}));
router.delete("/users/me/device-tokens", authMiddleware, asyncHandler(async (req, res) => {
  if (typeof req.body.fcmToken !== "string") throw new ApiError(400, "Device token is required");
  await DeviceToken.deleteOne({ userId: req.user!._id, fcmToken: req.body.fcmToken });
  res.sendStatus(204);
}));
router.delete("/users/me", authMiddleware, asyncHandler(async (req, res) => {
  if (req.body.confirmation !== "DELETE") throw new ApiError(400, "Confirm deletion by entering DELETE");
  if (process.env.NODE_ENV !== "development" &&
      (!req.auth?.auth_time || Date.now() / 1000 - Number(req.auth.auth_time) > 600)) {
    throw new ApiError(401, "Please sign in again before deleting your account");
  }
  const result = await requestAccountDeletion(req.user!._id);
  res.status(result.status === "complete" ? 200 : 202).json(result);
}));
router.post("/account-deletion-requests", httpLimit(policies.deletion, req => String(req.body?.contact || '').trim().toLowerCase()), asyncHandler(async (req, res) => {
  const contact = typeof req.body.contact === "string" ? req.body.contact.trim() : "";
  if (contact.length < 5 || contact.length > 200) throw new ApiError(400, "Enter your account email or phone number");
  await AccountDeletion.findOneAndUpdate({ contact, status: "verification_required" },
    { $setOnInsert: { contact, status: "verification_required", expiresAt: new Date(Date.now() + 90 * 86400000) } }, { upsert: true });
  res.status(202).json({ message: "Request received. Support will verify account ownership before deletion." });
}));
router.get("/users/me/blocked-users", authMiddleware, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user!._id).populate("blockedUsers", "fullName");
  res.json(user?.blockedUsers || []);
}));
router.post("/users/me/blocked-users", authMiddleware, asyncHandler(async (req, res) => {
  await blockUser(req.user!._id, req.body.userId);
  res.sendStatus(204);
}));
router.delete("/users/me/blocked-users/:id", authMiddleware, asyncHandler(async (req, res) => {
  if (!Types.ObjectId.isValid(String(req.params.id))) throw new ApiError(400, "Invalid user ID");
  await User.updateOne({ _id: req.user!._id }, { $pull: { blockedUsers: req.params.id } });
  res.sendStatus(204);
}));
router.post("/content-reports", authMiddleware, asyncHandler(async (req, res) => {
  res.status(201).json(await reportContent(req.user!._id, req.body));
}));
router.get("/admin/content-reports", authMiddleware, requireModerator, asyncHandler(async (_req, res) => {
  const reports = await ContentReport.find({ status: "open" }).sort({ createdAt: 1 }).limit(200)
    .populate("reporterId", "fullName").lean();
  res.json(await Promise.all(reports.map(async report => ({ ...report,
    content: await contentTarget(report.targetType, String(report.targetId)) }))));
}));
router.patch("/admin/content-reports/:id", authMiddleware, requireModerator, asyncHandler(async (req, res) => {
  res.json(await resolveContentReport(String(req.params.id), req.body.action, req.user!._id));
}));
router.get("/admin/account-deletion-requests", authMiddleware, requireAdmin, asyncHandler(async (_req, res) => {
  res.json(await AccountDeletion.find({ status: { $ne: "complete" } }).sort({ createdAt: 1 }).limit(200));
}));
router.post("/admin/account-deletion-requests/:id/verify", authMiddleware, requireAdmin, asyncHandler(async (req, res) => {
  if (!Types.ObjectId.isValid(String(req.params.id)) || !Types.ObjectId.isValid(req.body.userId)) throw new ApiError(400, "Invalid account or request ID");
  const request = await AccountDeletion.findById(req.params.id);
  if (!request || request.status !== "verification_required") throw new ApiError(404, "Request not found");
  if (req.body.ownershipVerified !== true) throw new ApiError(400, "Verify ownership with the requester first");
  const user = await User.findById(req.body.userId);
  if (!user || ![user.email, user.phoneNumber].includes(request.contact || "")) throw new ApiError(400, "Account does not match the request contact");
  const result = await requestAccountDeletion(user._id);
  await AccountDeletion.updateOne({ _id: request._id }, { $set: { status: "complete", completedAt: new Date() }, $unset: { contact: 1 } });
  res.json(result);
}));

router.post(
  "/users/me/device-tokens",
  authMiddleware,
  validate(registerTokenSchema),
  registerDeviceTokenController,
);
router.get("/users/me/bookings", authMiddleware, listMyBookingsController);

router.get(
  "/users/me/favorites",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { listFavoritesForUser } = await import("../services/favorite.service");
    res.json({ status: "success", data: await listFavoritesForUser(req.user!._id) });
  }),
);
router.post(
  "/users/me/favorites",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const businessId = String(req.body.businessId || "");
    const { addFavorite } = await import("../services/favorite.service");
    res.status(201).json({
      status: "success",
      data: await addFavorite(req.user!._id, businessId),
    });
  }),
);
router.delete(
  "/users/me/favorites/:businessId",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { removeFavorite } = await import("../services/favorite.service");
    res.json({
      status: "success",
      data: await removeFavorite(req.user!._id, String(req.params.businessId)),
    });
  }),
);
router.get(
  "/users/me/tickets",
  authMiddleware,
  validate(Joi.object({
    period: Joi.string().valid("upcoming", "past", "all").default("upcoming"),
    page: Joi.number().integer().min(1).max(100000).default(1),
    limit: Joi.number().integer().min(1).max(50).default(20),
  }), "query"),
  asyncHandler(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const query: ArchiveQuery = { period: String(req.query.period ?? "upcoming") as ArchiveQuery["period"], page: Number(req.query.page ?? 1), limit: Number(req.query.limit ?? 20) };
    res.json({ status: "success", data: await listCustomerTicketArchive(req.user!, query) });
  }),
);
router.get(
  "/users/me/receipts",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { listReceiptsForUser } = await import("../services/receipt.service");
    res.set("Cache-Control", "private, no-store");
    res.json({ status: "success", data: await listReceiptsForUser(req.user!._id, req.user!.firebaseUid) });
  }),
);
router.get(
  "/users/me/reviews",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { listMyReviewsForUser } = await import("../services/review.service");
    res.json({
      status: "success",
      data: await listMyReviewsForUser(req.user!._id),
    });
  }),
);

export default router;
