import { Router } from "express";
import mongoose, { Types } from "mongoose";
import multer from "multer";
import sharp from "sharp";
import { replaceStaffAvatar } from "../services/staff-avatar.service";
import auth from "../middlewares/auth.middleware";
import validate from "../middlewares/validate.middleware";
import asyncHandler from "../utils/asyncHandler";
import ApiError from "../utils/ApiError";
import { Joi } from "../validators/common";
import Booking from "../models/Booking";
import Availability from "../models/Availability";
import Absence from "../models/Absence";
import Service from "../models/Service";
import User from "../models/User";
import StaffProfile from "../models/StaffProfile";
import CustomerCredential from "../models/CustomerCredential";
import { barberContext, ownBookings, workspaceBookings, dateWindow, ethiopianDay } from "../services/barber-workspace.service";
import { emitBookingEvent } from "../services/realtime.service";
import { deleteLocalFile, toPublicUrl, uploadAndCompressImage } from "../services/media.service";
import { createWalkInBooking } from "../services/booking.service";

const router = Router();
router.use(auth);

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Dio's MultipartFile defaults to octet-stream. Verify actual bytes below.
    const allowed = ["application/octet-stream", "image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, WebP and GIF images are allowed"));
  },
});
router.param("id", (_req, _res, next, id) => next(Types.ObjectId.isValid(id) ? undefined : new ApiError(400, "Invalid record ID")));
router.get("/me", asyncHandler(async (req, res) => {
  const ctx = await barberContext(req.user!._id, req.get("x-business-id"));
  const services = await Service.find({ _id: { $in: ctx.profile.services }, businessId: ctx.business._id, isActive: { $ne: false } }).select("name duration basePrice").lean();
  res.json({ data: {
    user: { _id: ctx.user._id, fullName: ctx.user.fullName, email: ctx.user.email, phoneNumber: ctx.user.phoneNumber, profilePicture: ctx.profile.profilePicture || ctx.user.profilePicture ? toPublicUrl(ctx.profile.profilePicture || ctx.user.profilePicture!) : null },
    business: { _id: ctx.business._id, name: ctx.business.name, address: ctx.business.addressString, openingTime: ctx.business.openingTime, closingTime: ctx.business.closingTime, weeklySchedule: ctx.business.weeklySchedule },
    profile: { biography: ctx.profile.biography || "", specialties: ctx.profile.specialties, services, commissionRate: ctx.profile.serviceCommission.value, commissionType: ctx.profile.serviceCommission.type, isOnlineVisible: ctx.profile.isOnlineVisible, permissionLevel: ctx.profile.permissionLevel, hourlyWage: ctx.profile.hourlyWage },
  } });
}));
router.post("/me/avatar", (req, res, next) => {
  avatarUpload.single("avatar")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") return next(new ApiError(400, "Avatar must be 5MB or smaller."));
      return next(new ApiError(400, err.message));
    }
    if (err instanceof Error) return next(new ApiError(400, err.message));
    return next(new ApiError(400, "Invalid avatar upload."));
  });
}, asyncHandler(async (req, res) => {
  const ctx = await barberContext(req.user!._id, req.get("x-business-id"));
  const file = req.file;
  if (!file) throw new ApiError(400, "No image file provided");
  try {
    const metadata = await sharp(file.buffer, { limitInputPixels: 25000000 }).metadata();
    if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format || '')) {
      throw new Error('Unsupported image');
    }
  } catch {
    throw new ApiError(400, "Choose a valid JPEG, PNG, WebP or GIF image (up to 25 megapixels).");
  }
  const imagePath = await replaceStaffAvatar(
    async () => {
      try { return await uploadAndCompressImage(file.buffer, "avatars"); }
      catch { throw new ApiError(400, "Could not process the image. Choose another photo."); }
    },
    async (path) => {
      // Return the actual previous path atomically, including concurrent uploads.
      const previous = await StaffProfile.findOneAndUpdate(
        { _id: ctx.profile._id, staffId: ctx.profile.staffId, businessId: ctx.business._id, isActive: true },
        { $set: { profilePicture: path } }, { new: false },
      );
      if (!previous) throw new ApiError(409, "Your staff membership changed. Reopen your workspace.");
      return previous.profilePicture;
    },
    deleteLocalFile,
  );
  res.json({ data: { profilePicture: toPublicUrl(imagePath) } });
}));
const range = Joi.object({ from: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(), to: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required() });
router.get("/bookings", validate(range, "query"), asyncHandler(async (req, res) => {
  const ctx = await barberContext(req.user!._id, req.get("x-business-id"));
  const from = dateWindow(String(req.query.from)).from, to = dateWindow(String(req.query.to)).from;
  if (to <= from || to.getTime() - from.getTime() > 93 * 86400000) throw new ApiError(400, "Choose a range of up to three months");
  res.json({ data: await workspaceBookings(ctx, from, to) });
}));
router.post("/bookings", validate(Joi.object({ fullName: Joi.string().trim().min(2).max(100).required(), phoneNumber: Joi.string().pattern(/^\+[1-9]\d{7,14}$/).required(), serviceIds: Joi.array().min(1).unique().items(Joi.string().hex().length(24)).required(), startTime: Joi.date().iso().required(), notes: Joi.string().max(1000).allow("").default("") })), asyncHandler(async (req, res) => {
  const ctx = await barberContext(req.user!._id, req.get("x-business-id"));
  if (ctx.profile.permissionLevel === "low") throw new ApiError(403, "Your shop has not granted permission to add appointments");
  if (req.body.serviceIds.some((id: string) => !ctx.profile.services.some(s => String(s) === id))) throw new ApiError(403, "Choose only services assigned to you");
  const services = await Service.find({ _id: { $in: req.body.serviceIds }, businessId: ctx.business._id, isActive: { $ne: false } });
  if (services.length !== req.body.serviceIds.length) throw new ApiError(400, "A selected service is unavailable");
  let cursor = new Date(req.body.startTime);
  if (cursor < new Date()) throw new ApiError(400, "Choose a future appointment time");
  const plan = req.body.serviceIds.map((id: string) => {
    const service = services.find(s => String(s._id) === id)!;
    const startTime = cursor.toISOString(); cursor = new Date(cursor.getTime() + service.duration * 60000);
    return { staffId: ctx.profile.staffId, serviceId: id, startTime, endTime: cursor.toISOString() };
  });
  const start = new Date(req.body.startTime), local = new Date(start.getTime() + 3 * 3600000), end = new Date(cursor.getTime() + 3 * 3600000);
  const day = ctx.business.weeklySchedule?.find(d => d.dayOfWeek === local.getUTCDay());
  const hours = await Availability.find({ staffId: { $in: ctx.aliases }, dayOfWeek: local.getUTCDay() }).lean();
  const clock = (d: Date) => d.toISOString().slice(11, 16);
  if (day?.isOpen === false || local.toISOString().slice(0, 10) !== end.toISOString().slice(0, 10) || clock(local) < (day?.openingTime || ctx.business.openingTime) || clock(end) > (day?.closingTime || ctx.business.closingTime) || !hours.some(h => h.startTime <= clock(local) && h.endTime >= clock(end))) throw new ApiError(409, "Choose a time within your working hours and shop hours");
  if (await Booking.exists({ ...ownBookings(ctx), status: { $in: ["pending", "confirmed"] }, startTime: { $lt: cursor }, endTime: { $gt: start } }) || await Absence.exists({ staffId: { $in: ctx.aliases }, businessId: ctx.business._id, startTime: { $lt: cursor }, endTime: { $gt: start } })) throw new ApiError(409, "This time is unavailable");
  const booking = await createWalkInBooking({ businessId: String(ctx.business._id), serviceIds: req.body.serviceIds, staffPlan: plan, startTime: new Date(req.body.startTime).toISOString(), endTime: cursor.toISOString(), paymentMethod: "cash", fullName: req.body.fullName, phoneNumber: req.body.phoneNumber, notes: req.body.notes, userLng: ctx.business.location.coordinates[0], userLat: ctx.business.location.coordinates[1] });
  if (req.body.notes) { booking.appointmentNotes = req.body.notes; await booking.save(); }
  res.status(201).json({ data: { _id: booking._id } });
}));
router.patch("/bookings/:id", validate(Joi.object({ action: Joi.string().valid("start", "complete", "no-show").required() })), asyncHandler(async (req, res) => {
  const ctx = await barberContext(req.user!._id, req.get("x-business-id"));
  const booking = await Booking.findOne({ _id: req.params.id, ...ownBookings(ctx) });
  if (!booking) throw new ApiError(404, "Assigned appointment not found");
  if (booking.status !== "confirmed" || booking.completedAt) throw new ApiError(409, "Only active confirmed appointments can be updated");
  const segments = booking.staffPlan.filter(p => ctx.aliases.includes(p.staffId));
  const start = segments.length ? new Date(Math.min(...segments.map(p => p.startTime.getTime()))) : booking.startTime;
  const now = new Date();
  if (start > now) throw new ApiError(400, "This appointment has not started yet");
  const progress = booking.staffProgress?.find(p => ctx.aliases.includes(p.staffId));
  if (progress?.completedAt) throw new ApiError(409, "Your service is already completed");
  const staffId = ctx.profile.staffId;
  const assigned = [...new Set(booking.staffPlan.map(p => p.staffId))];
  if (req.body.action === "no-show") {
    if (assigned.some(id => !ctx.aliases.includes(id))) throw new ApiError(409, "Ask the shop to handle a missed appointment shared by multiple barbers");
    const updated = await Booking.findOneAndUpdate({ _id: booking._id, status: "confirmed", completedAt: { $exists: false } }, { $set: { status: "no-show", noShowMarkedAt: now } }, { new: true });
    if (!updated) throw new ApiError(409, "Appointment changed. Refresh and try again");
    emitBookingEvent("booking:updated", updated);
  } else {
    if (req.body.action === "complete" && !progress?.startedAt) throw new ApiError(409, "Start your service before completing it");
    const next = [...(booking.staffProgress || []).filter(p => !ctx.aliases.includes(p.staffId)), { staffId, aliases: ctx.aliases, startedAt: progress?.startedAt || now, ...(req.body.action === "complete" ? { completedAt: now } : {}) }];
    const allCompleted = req.body.action === "complete" && assigned.every(id => ctx.aliases.includes(id) || next.some(p => (p.staffId === id || p.aliases?.includes(id)) && p.completedAt));
    const updated = await Booking.findOneAndUpdate({ _id: booking._id, status: "confirmed", updatedAt: (booking as any).updatedAt }, { $set: { staffProgress: next, ...(allCompleted ? { completedAt: now } : {}) } }, { new: true });
    if (!updated) throw new ApiError(409, "Appointment changed. Refresh and try again");
    emitBookingEvent("booking:updated", updated);
  }
  res.json({ data: { updated: true } });
}));
router.get("/schedule", asyncHandler(async (req, res) => {
  const ctx = await barberContext(req.user!._id, req.get("x-business-id"));
  res.json({ data: await Availability.find({ staffId: { $in: ctx.aliases } }).sort({ dayOfWeek: 1, startTime: 1 }).lean() });
}));
const time = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required();
router.put("/schedule", validate(Joi.array().max(28).items(Joi.object({ dayOfWeek: Joi.number().integer().min(0).max(6).required(), startTime: time, endTime: time }))), asyncHandler(async (req, res) => {
  const ctx = await barberContext(req.user!._id, req.get("x-business-id"));
  const entries: Array<{ dayOfWeek: number; startTime: string; endTime: string }> = req.body;
  for (const day of [0, 1, 2, 3, 4, 5, 6]) {
    const periods = entries.filter(p => p.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const shopDay = ctx.business.weeklySchedule?.find(d => d.dayOfWeek === day);
    const opening = shopDay?.openingTime || ctx.business.openingTime;
    const closing = shopDay?.closingTime || ctx.business.closingTime;
    for (let i = 0; i < periods.length; i++) {
      const p = periods[i];
      if (shopDay?.isOpen === false || p.startTime >= p.endTime || p.startTime < opening || p.endTime > closing || i > 0 && periods[i - 1].endTime > p.startTime) throw new ApiError(400, "Working periods must fit shop hours and must not overlap");
    }
  }
  const future = await workspaceBookings(ctx, new Date(), new Date(Date.now() + 93 * 86400000));
  for (const b of future.filter(b => b.state === "confirmed" || b.state === "pending" || b.state === "in_progress")) {
    const local = new Date(b.startTime.getTime() + 3 * 3600000), end = new Date(b.endTime.getTime() + 3 * 3600000);
    const clock = (d: Date) => d.toISOString().slice(11, 16);
    if (!entries.some(p => p.dayOfWeek === local.getUTCDay() && p.startTime <= clock(local) && p.endTime >= clock(end))) throw new ApiError(409, "These hours would exclude an existing appointment. Ask the shop to move it first");
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const p of entries) await Availability.updateOne({ staffId: ctx.profile.staffId, ...p }, { $setOnInsert: { staffId: ctx.profile.staffId, ...p } }, { upsert: true, session });
      await Availability.deleteMany({ staffId: { $in: ctx.aliases }, ...(entries.length ? { $nor: entries.map(p => ({ staffId: ctx.profile.staffId, ...p })) } : {}) }, { session });
    });
  } finally { await session.endSession(); }
  res.json({ data: entries });
}));
router.get("/absences", asyncHandler(async (req, res) => {
  const ctx = await barberContext(req.user!._id, req.get("x-business-id"));
  res.json({ data: await Absence.find({ businessId: ctx.business._id, staffId: { $in: ctx.aliases }, endTime: { $gte: new Date() } }).sort({ startTime: 1 }).lean() });
}));
router.post("/absences", validate(Joi.object({ startTime: Joi.date().iso().required(), endTime: Joi.date().iso().greater(Joi.ref("startTime")).required(), reason: Joi.string().max(300).allow("").default("") })), asyncHandler(async (req, res) => {
  const ctx = await barberContext(req.user!._id, req.get("x-business-id"));
  const from = new Date(req.body.startTime), to = new Date(req.body.endTime);
  if (from < new Date() || to.getTime() - from.getTime() > 31 * 86400000) throw new ApiError(400, "Choose future time off of up to 31 days");
  if (await Booking.exists({ ...ownBookings(ctx), status: { $in: ["pending", "confirmed"] }, completedAt: { $exists: false }, startTime: { $lt: to }, endTime: { $gt: from } })) throw new ApiError(409, "An assigned appointment overlaps this time off. Ask the shop to move it first");
  res.status(201).json({ data: await Absence.create({ ...req.body, businessId: ctx.business._id, staffId: ctx.profile.staffId }) });
}));
router.delete("/absences/:id", asyncHandler(async (req, res) => {
  const ctx = await barberContext(req.user!._id, req.get("x-business-id"));
  const deleted = await Absence.deleteOne({ _id: req.params.id, businessId: ctx.business._id, staffId: { $in: ctx.aliases } });
  if (!deleted.deletedCount) throw new ApiError(404, "Time off not found");
  res.sendStatus(204);
}));
router.patch("/profile", validate(Joi.object({ fullName: Joi.string().trim().min(2).max(100).required(), phoneNumber: Joi.string().pattern(/^\+[1-9]\d{7,14}$/).required(), biography: Joi.string().max(1000).allow("").default(""), specialties: Joi.array().max(10).items(Joi.string().trim().max(60)).default([]) })), asyncHandler(async (req, res) => {
  const ctx = await barberContext(req.user!._id, req.get("x-business-id"));
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (req.body.phoneNumber !== ctx.user.phoneNumber &&
          await CustomerCredential.exists({ userId: ctx.user._id }).session(session)) {
        throw new ApiError(409, "Phone login is linked to your current number. Contact support before changing it.");
      }
      await User.updateOne({ _id: ctx.user._id }, { $set: { fullName: req.body.fullName, phoneNumber: req.body.phoneNumber } }, { session });
      await StaffProfile.updateOne({ _id: ctx.profile._id }, { $set: { biography: req.body.biography, specialties: req.body.specialties, firstName: req.body.fullName.split(" ")[0], lastName: req.body.fullName.split(" ").slice(1).join(" ") } }, { session });
    });
  } finally { await session.endSession(); }
  res.json({ data: { saved: true } });
}));
router.patch("/visibility", validate(Joi.object({ visible: Joi.boolean().required() })), asyncHandler(async (req, res) => {
  const ctx = await barberContext(req.user!._id, req.get("x-business-id"));
  ctx.profile.isOnlineVisible = req.body.visible;
  await ctx.profile.save();
  res.json({ data: { visible: ctx.profile.isOnlineVisible } });
}));
router.get("/inbox", asyncHandler(async (req, res) => {
  const ctx = await barberContext(req.user!._id, req.get("x-business-id"));
  const now = new Date(), from = new Date(now.getTime() - 90 * 86400000), to = new Date(now.getTime() + 93 * 86400000);
  const bookings = await workspaceBookings(ctx, from, to);
  const messages = bookings.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 50).map(b => ({ bookingId: b._id, title: b.state === "cancelled" ? "Appointment cancelled" : b.state === "completed" ? "Service completed" : "Appointment update", body: `${b.customer.name} - ${b.services.map(s => s.name).join(", ")}`, timestamp: b.updatedAt, unread: new Date(b.updatedAt) > (ctx.profile.inboxReadAt || new Date(0)), date: ethiopianDay(b.startTime) }));
  res.json({ data: messages });
}));
router.get("/clients", validate(Joi.object({ search: Joi.string().max(80).allow("").default(""), page: Joi.number().integer().min(1).max(10000).default(1) }), "query"), asyncHandler(async (req, res) => {
  const ctx = await barberContext(req.user!._id, req.get("x-business-id"));
  const search = String(req.query.search || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const page = Number(req.query.page || 1);
  const [result] = await Booking.aggregate([
    { $match: ownBookings(ctx) },
    { $group: { _id: { $cond: [{ $ne: [{ $ifNull: ["$clientId", null] }, null] }, { $concat: ["c-", { $toString: "$clientId" }] }, { $concat: ["u-", "$userId"] }] }, userId: { $first: "$userId" }, clientId: { $first: "$clientId" }, appointments: { $sum: 1 }, lastVisit: { $max: "$startTime" } } },
    { $lookup: { from: "clients", localField: "clientId", foreignField: "_id", as: "client" } },
    { $lookup: { from: "users", let: { id: "$userId" }, pipeline: [{ $match: { $expr: { $or: [{ $eq: [{ $toString: "$_id" }, "$$id"] }, { $eq: ["$firebaseUid", "$$id"] }] } } }, { $project: { fullName: 1, phoneNumber: 1 } }], as: "user" } },
    { $set: { name: { $ifNull: [{ $arrayElemAt: ["$client.fullName", 0] }, { $ifNull: [{ $arrayElemAt: ["$user.fullName", 0] }, "Customer"] }] }, phone: { $ifNull: [{ $arrayElemAt: ["$client.phoneNumber", 0] }, { $ifNull: [{ $arrayElemAt: ["$user.phoneNumber", 0] }, ""] }] } } },
    ...(search ? [{ $match: { $or: [{ name: { $regex: search, $options: "i" } }, { phone: { $regex: search } }] } }] : []),
    { $sort: { name: 1, _id: 1 } },
    { $facet: { clients: [{ $skip: (page - 1) * 50 }, { $limit: 50 }, { $project: { id: "$_id", name: 1, phone: 1, appointments: 1, lastVisit: 1, _id: 0 } }], count: [{ $count: "total" }] } },
  ]);
  res.json({ data: { clients: result?.clients || [], total: result?.count[0]?.total || 0, page } });
}));
router.get("/clients/:key/bookings", asyncHandler(async (req, res) => {
  const ctx = await barberContext(req.user!._id, req.get("x-business-id"));
  const key = String(req.params.key);
  if (key.length > 150 || !/^[cu]-/.test(key)) throw new ApiError(400, "Invalid client ID");
  const id = key.slice(2);
  if (key.startsWith("c-") && !Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid client ID");
  const extra = key.startsWith("c-") ? { clientId: new Types.ObjectId(id) } : { userId: id };
  const bookings = await workspaceBookings(ctx, new Date("2000-01-01"), new Date("2100-01-01"), extra);
  res.json({ data: bookings.reverse() });
}));
router.post("/inbox/read", asyncHandler(async (req, res) => {
  const ctx = await barberContext(req.user!._id, req.get("x-business-id"));
  ctx.profile.inboxReadAt = new Date(); await ctx.profile.save(); res.sendStatus(204);
}));
export default router;
