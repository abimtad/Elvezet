import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware";
import asyncHandler from "../utils/asyncHandler";
import ApiError from "../utils/ApiError";
import Business from "../models/Business";
import Service from "../models/Service";
import Availability from "../models/Availability";
import Absence from "../models/Absence";
import StaffProfile from "../models/StaffProfile";
import Booking from "../models/Booking";
import User from "../models/User";
import SmsSubscription from "../models/SmsSubscription";
import { createBusiness } from "../services/business.service";
import validate from "../middlewares/validate.middleware";
import { Joi } from "../validators/common";
import { emitBookingEvent } from "../services/realtime.service";
import mongoose, { Types } from "mongoose";
import { queueBookingNotifications } from "../services/booking.service";
import { notifyBookingEvent } from "../services/booking-notifications.service";
import { getNotificationQueue } from "../jobs/queue";

const router = Router();
router.param("id", (_req, _res, next, id) => next(Types.ObjectId.isValid(id) ? undefined : new ApiError(400, "Invalid appointment or block ID")));
router.use(authMiddleware);
router.post("/setup", validate(Joi.object({
  smsRequested: Joi.boolean().optional(),
  genderTarget: Joi.string().valid("male", "female", "all", "unknown").default("unknown"),
  name: Joi.string().trim().min(2).max(120).required(),
  addressString: Joi.string().trim().max(500).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  latitude: Joi.number().min(-90).max(90).required(),
})), asyncHandler(async (req, res) => {
  if (await Business.exists({ ownerId: req.user!._id })) throw new ApiError(409, "You already own a business");
  const business = await createBusiness({ ...req.body, ownerId: req.user!._id, type: "independent", isVisible: false });
  business.isVisible = false;
  await business.save();
  if (req.body.smsRequested === true) await SmsSubscription.create({ businessId: business._id, requestedAt: new Date(), periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 86400000) });
  await User.updateOne({ _id: req.user!._id }, { $addToSet: { roles: "owner" } });
  res.status(201).json({ data: business });
}));
const businessFor = async (ownerId: Types.ObjectId, businessId?: string) => {
  if (businessId && !Types.ObjectId.isValid(businessId)) throw new ApiError(400, "Invalid workspace");
  const business = await Business.findOne({ ownerId, type: "independent", ...(businessId ? { _id: businessId } : {}) });
  if (!business) throw new ApiError(404, "Create an independent business first");
  return business;
};

router.get("/me", asyncHandler(async (req, res) => {
  const business = await businessFor(req.user!._id, req.get("x-business-id"));
  const services = await Service.find({ businessId: business._id }).lean();
  res.json({ data: { business, services, professionalId: String(req.user!._id) } });
}));

router.get("/bookings", validate(Joi.object({
  from: Joi.date().iso().required(), to: Joi.date().iso().greater(Joi.ref("from")).required(),
}), "query"), asyncHandler(async (req, res) => {
  const business = await businessFor(req.user!._id, req.get("x-business-id"));
  const from = new Date(String(req.query.from));
  const to = new Date(String(req.query.to));
  if (to.getTime() - from.getTime() > 93 * 86400000) throw new ApiError(400, "Choose up to three months");
  const bookings = await Booking.find({ businessId: business._id, startTime: { $gte: from, $lt: to } })
    .populate("clientId", "fullName phoneNumber").populate("serviceIds", "name duration basePrice")
    .sort({ startTime: 1 }).lean();
  const users = await User.find({ _id: { $in: bookings.map(b => String(b.userId)).filter(Types.ObjectId.isValid) } })
    .select("fullName phoneNumber").lean();
  const customers = new Map(users.map(user => [String(user._id), user]));
  res.json({ data: bookings.map(booking => ({ ...booking,
    clientId: booking.clientId || customers.get(String(booking.userId)),
  })) });
}));
// Notification destinations can be outside the calendar's currently loaded month.
router.get("/bookings/:id", asyncHandler(async (req, res) => {
  const business = await businessFor(req.user!._id, req.get("x-business-id"));
  const booking = await Booking.findOne({ _id: req.params.id, businessId: business._id })
    .populate("clientId", "fullName phoneNumber").populate("serviceIds", "name duration basePrice").lean();
  if (!booking) throw new ApiError(404, "Appointment not found");
  const customer = booking.clientId || (Types.ObjectId.isValid(String(booking.userId))
    ? await User.findById(booking.userId).select("fullName phoneNumber").lean() : null);
  res.set("Cache-Control", "private, no-store").json({ data: { ...booking, clientId: customer } });
}));
router.get("/customers/:id/bookings", asyncHandler(async (req, res) => {
  const business = await businessFor(req.user!._id, req.get("x-business-id"));
  const bookings = await Booking.find({ businessId: business._id,
    $or: [{ userId: String(req.params.id) }, { clientId: req.params.id }] })
    .populate("serviceIds", "name duration basePrice").sort({ startTime: -1 }).limit(100).lean();
  res.json({ data: bookings });
}));
router.patch("/bookings/:id/status", validate(Joi.object({
  status: Joi.string().valid("confirmed", "completed", "no-show").required(),
})), asyncHandler(async (req, res) => {
  const business = await businessFor(req.user!._id, req.get("x-business-id"));
  const booking = await Booking.findOne({ _id: req.params.id, businessId: business._id });
  if (!booking) throw new ApiError(404, "Appointment not found");
  if (["cancelled", "expired", "no-show", "no_show"].includes(booking.status)) throw new ApiError(409, "This appointment is no longer active");
  const wasPending = booking.status === "pending";
  if (wasPending && !booking.isWalkIn && booking.paymentStatus !== "paid" && ["confirmed", "completed"].includes(req.body.status)) throw new ApiError(409, "Verify the payment receipt or record cash received before confirming this booking");
  if (booking.completedAt && req.body.status !== "completed") throw new ApiError(409, "This appointment is already completed");
  if (req.body.status === "no-show" && booking.startTime > new Date()) throw new ApiError(400, "Cannot mark a future appointment missed");
  if (req.body.status === "completed") {
    if (booking.startTime > new Date()) throw new ApiError(400, "Cannot complete a future appointment");
    booking.completedAt = new Date();
    booking.status = "confirmed";
  } else booking.status = req.body.status;
  await booking.save();
  emitBookingEvent("booking:updated", booking);
  if (wasPending && req.body.status === "confirmed") {
    try { await queueBookingNotifications(booking); } catch { console.warn("Independent confirmation notification unavailable"); }
  }
  res.json({ data: booking });
}));
router.post("/bookings/:id/cancel", asyncHandler(async (req, res) => {
  const business = await businessFor(req.user!._id, req.get("x-business-id"));
  const booking = await Booking.findOneAndUpdate({ _id: req.params.id, businessId: business._id, status: { $in: ["confirmed", "pending"] } },
    { $set: { status: "cancelled", cancelledBy: req.user!._id, cancelledAt: new Date(), cancellationReason: "Cancelled by independent barber" }, $addToSet: { notificationEvents: "booking_cancelled" } }, { new: true });
  if (!booking) throw new ApiError(409, "Appointment is no longer active");
  emitBookingEvent("booking:updated", booking);
  await notifyBookingEvent(String(booking._id), "booking_cancelled");
  res.json({ data: booking });
}));
router.post("/bookings/:id/cash-payment", asyncHandler(async (req, res) => {
  const business = await businessFor(req.user!._id, req.get("x-business-id"));
  const wasPending = await Booking.exists({ _id: req.params.id, businessId: business._id, status: "pending", paymentStatus: "unpaid" });
  const booking = await Booking.findOneAndUpdate({ _id: req.params.id, businessId: business._id,
    paymentStatus: "unpaid", status: { $in: ["confirmed", "pending"] } },
    { $set: { paymentStatus: "paid", paymentMethod: "cash", paidAt: new Date(), status: "confirmed" }, ...(wasPending ? { $addToSet: { notificationEvents: "booking_confirmed" } } : {}) }, { new: true });
  if (!booking) throw new ApiError(409, "Appointment is already paid or no longer active");
  emitBookingEvent("booking:updated", booking);
  if (wasPending) await notifyBookingEvent(String(booking._id), "booking_confirmed");
  res.json({ data: booking });
}));

const time = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required();
export const independentScheduleSchema = Joi.array().items(Joi.object({
  dayOfWeek: Joi.number().integer().min(0).max(6).required(),
  startTime: time,
  endTime: time,
})).max(28).custom((rows, helpers) => {
  for (const row of rows) {
    if (row.startTime >= row.endTime) return helpers.error("any.invalid");
    if (rows.some((other: typeof row) => other !== row && other.dayOfWeek === row.dayOfWeek &&
      row.startTime < other.endTime && row.endTime > other.startTime)) return helpers.error("any.invalid");
  }
  return rows;
});

router.get("/schedule", asyncHandler(async (req, res) => {
  const business = await businessFor(req.user!._id, req.get("x-business-id"));
  const rows = await Availability.find({ staffId: String(req.user!._id) }).sort({ dayOfWeek: 1, startTime: 1 }).lean();
  const configured = (business.weeklySchedule?.length ?? 0) === 7 && business.weeklySchedule?.every(day => !day.isOpen);
  res.json({ data: rows.length || configured ? rows : await Availability.find({ staffId: req.user!.firebaseUid }).sort({ dayOfWeek: 1, startTime: 1 }).lean() });
}));
router.put("/schedule", validate(independentScheduleSchema), asyncHandler(async (req, res) => {
  const business = await businessFor(req.user!._id, req.get("x-business-id"));
  const staffId = String(req.user!._id);
  const rows = req.body as Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  const services = await Service.find({ businessId: business._id }).select("_id");
  const session = await mongoose.startSession();
  try { await session.withTransaction(async () => {
  await StaffProfile.findOneAndUpdate({ businessId: business._id, staffId }, {
    $set: { services: services.map(service => service._id), isActive: true, isBookableInCalendar: true },
    $setOnInsert: { businessId: business._id, staffId },
  }, { upsert: true, runValidators: true, session });
  const previous = await Availability.find({ staffId }).session(session);
  const wanted = new Set(rows.map(row => `${row.dayOfWeek}/${row.startTime}/${row.endTime}`));
  if (rows.length) await Availability.bulkWrite(rows.map(row => ({ updateOne: {
    filter: { staffId, ...row }, update: { $setOnInsert: { staffId, ...row } }, upsert: true,
  } })), { session });
  await Availability.deleteMany({ _id: { $in: previous.filter(row => !wanted.has(`${row.dayOfWeek}/${row.startTime}/${row.endTime}`)).map(row => row._id) } }).session(session);
  business.openingTime = rows.length ? rows.map(row => row.startTime).sort()[0] : "09:00";
  business.closingTime = rows.length ? rows.map(row => row.endTime).sort().at(-1)! : "18:00";
  business.weeklySchedule = Array.from({ length: 7 }, (_, dayOfWeek) => {
    const day = rows.filter(row => row.dayOfWeek === dayOfWeek);
    return { dayOfWeek, isOpen: day.length > 0, openingTime: day.map(row => row.startTime).sort()[0], closingTime: day.map(row => row.endTime).sort().at(-1) };
  });
  await business.save({ session });
  }); } finally { await session.endSession(); }
  res.json({ data: rows });
}));

router.get("/absences", asyncHandler(async (req, res) => {
  const business = await businessFor(req.user!._id, req.get("x-business-id"));
  res.json({ data: await Absence.find({ businessId: business._id, staffId: { $in: [String(req.user!._id), req.user!.firebaseUid] }, endTime: { $gte: new Date() } }).sort({ startTime: 1 }).lean() });
}));
router.post("/absences", validate(Joi.object({
  startTime: Joi.date().iso().required(), endTime: Joi.date().iso().greater(Joi.ref("startTime")).required(), reason: Joi.string().max(300).allow("").optional(),
})), asyncHandler(async (req, res) => {
  const business = await businessFor(req.user!._id, req.get("x-business-id"));
  if (await Booking.exists({ businessId: business._id, status: { $in: ["confirmed", "pending"] }, startTime: { $lt: req.body.endTime }, endTime: { $gt: req.body.startTime } })) {
    throw new ApiError(409, "Reschedule or cancel existing appointments before blocking this time");
  }
  res.status(201).json({ data: await Absence.create({ ...req.body, businessId: business._id, staffId: String(req.user!._id) }) });
}));
router.delete("/absences/:id", asyncHandler(async (req, res) => {
  const business = await businessFor(req.user!._id, req.get("x-business-id"));
  const removed = await Absence.findOneAndDelete({ _id: req.params.id, businessId: business._id, staffId: { $in: [String(req.user!._id), req.user!.firebaseUid] } });
  if (!removed) throw new ApiError(404, "Blocked time not found");
  res.sendStatus(204);
}));
export default router;
