import { Router } from "express";
import { Types } from "mongoose";
import { randomUUID } from "crypto";
import { accountKey, httpLimit } from '../middlewares/traffic.middleware';
import { policies } from '../services/traffic-limit.service';
import auth from "../middlewares/auth.middleware";
import admin from "../middlewares/admin.middleware";
import validate from "../middlewares/validate.middleware";
import { Joi } from "../validators/common";
import asyncHandler from "../utils/asyncHandler";
import ApiError from "../utils/ApiError";
import Business from "../models/Business";
import User from "../models/User";
import SmsSubscription from "../models/SmsSubscription";
import SmsMessage from "../models/SmsMessage";
import { normalizeSmsPhone, smsMode } from "../services/sms-provider";

const router = Router();
router.use(auth);
router.get("/admin/businesses", admin, asyncHandler(async (req, res) => {
  const page = Math.max(0, Math.min(10000, Number(req.query.page) || 0));
  const businesses = await Business.find().select("name type ownerId smsContactPhone").sort({ createdAt: -1 }).skip(page * 50).limit(50).lean();
  const subscriptions = await SmsSubscription.find({ businessId: { $in: businesses.map(b => b._id) } }).lean();
  res.json({ data: businesses.map(b => ({ ...b, subscription: subscriptions.find(s => String(s.businessId) === String(b._id)) || null })) });
}));
router.param("businessId", (_req, _res, next, id) => next(Types.ObjectId.isValid(id) ? undefined : new ApiError(400, "Invalid business ID")));
const owned = async (id: string, ownerId: Types.ObjectId) => {
  const business = await Business.findOne({ _id: id, ownerId });
  if (!business) throw new ApiError(404, "Business not found");
  return business;
};
router.get("/:businessId", asyncHandler(async (req, res) => {
  const business = await owned(String(req.params.businessId), req.user!._id);
  const subscription = await SmsSubscription.findOne({ businessId: business._id }).lean();
  const messages = await SmsMessage.find({ businessId: business._id }).sort({ createdAt: -1 }).limit(50).lean();
  const owner = business.type === "independent" ? await User.findById(business.ownerId).lean() : null;
  res.json({ data: { phone: business.smsContactPhone || owner?.phoneNumber || "", subscription, messages, mode: smsMode() } });
}));
router.put("/:businessId", validate(Joi.object({ phone: Joi.string().max(30).required(), enabledEvents: Joi.array().items(Joi.string().valid("booking_created", "booking_confirmed")).unique().required(), consent: Joi.boolean().valid(true).required() })), asyncHandler(async (req, res) => {
  const business = await owned(String(req.params.businessId), req.user!._id);
  const phone = normalizeSmsPhone(req.body.phone);
  if (!phone) throw new ApiError(400, "Use a valid international phone number");
  business.smsContactPhone = phone;
  await business.save();
  const subscription = await SmsSubscription.findOneAndUpdate({ businessId: business._id }, { $set: { enabledEvents: req.body.enabledEvents, consentAt: new Date() }, $setOnInsert: { periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 86400000), status: "paused" } }, { upsert: true, new: true });
  res.json({ data: subscription });
}));
router.post("/:businessId/trial", asyncHandler(async (req, res) => {
  if (!await SmsSubscription.exists({ businessId: req.params.businessId, adminEnabled: true })) throw new ApiError(403, "Request SMS access from the administrator first");
  const business = await owned(String(req.params.businessId), req.user!._id);
  if (!normalizeSmsPhone(business.smsContactPhone)) throw new ApiError(400, "Save your SMS contact and consent first");
  const subscription = await SmsSubscription.findOneAndUpdate({ businessId: business._id, consentAt: { $exists: true }, trialGrantedAt: { $exists: false }, status: "paused" }, { $set: { trialGrantedAt: new Date(), status: "trial", monthlyQuota: 200, periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 86400000) } }, { new: true });
  if (!subscription) throw new ApiError(409, "Trial already used or subscription unavailable");
  res.json({ data: subscription });
}));
router.post("/:businessId/pause", asyncHandler(async (req, res) => {
  await owned(String(req.params.businessId), req.user!._id);
  await SmsSubscription.updateOne({ businessId: req.params.businessId }, { $set: { status: "paused" } });
  res.json({ data: { status: "paused" } });
}));
router.post("/:businessId/test", httpLimit(policies.smsTest, req => `${accountKey(req)}:${req.params.businessId}`), asyncHandler(async (req, res) => {
  if (!await SmsSubscription.exists({ businessId: req.params.businessId, adminEnabled: true })) throw new ApiError(403, "SMS access is not enabled by the administrator");
  const business = await owned(String(req.params.businessId), req.user!._id);
  const subscription = await SmsSubscription.findOne({ businessId: business._id, status: { $in: ["trial", "active"] }, consentAt: { $exists: true }, periodEnd: { $gt: new Date() } });
  const phone = normalizeSmsPhone(business.smsContactPhone);
  if (!subscription || !phone) throw new ApiError(400, "An active subscription and contact phone are required");
  // Test uses an enabled event so the same quota and subscription checks apply.
  const event = subscription.enabledEvents[0];
  if (!event) throw new ApiError(400, "Enable a booking event first");
  const message = await SmsMessage.create({ businessId: business._id, toPhone: phone, body: "Zolmi: Your booking SMS test.", event, idempotencyKey: `test-${randomUUID()}` });
  res.status(202).json({ data: { id: message._id, status: "queued" } });
}));
router.put("/:businessId/admin", admin, validate(Joi.object({ status: Joi.string().valid("active", "paused", "past_due", "cancelled").required(), monthlyQuota: Joi.number().integer().min(0).max(100000).required(), renewPeriod: Joi.boolean().default(false) })), asyncHandler(async (req, res) => {
  if (!await Business.exists({ _id: req.params.businessId })) throw new ApiError(404, "Business not found");
  if (req.body.renewPeriod && await SmsSubscription.exists({ businessId: req.params.businessId, reservedThisPeriod: { $gt: 0 } })) throw new ApiError(409, "Wait for pending SMS deliveries before renewing");
  const period = { periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 86400000) };
  const existing = await SmsSubscription.exists({ businessId: req.params.businessId });
  const subscription = await SmsSubscription.findOneAndUpdate({ businessId: req.params.businessId, ...(req.body.renewPeriod && existing ? { reservedThisPeriod: 0 } : {}) }, { $set: { status: req.body.status, monthlyQuota: req.body.monthlyQuota, ...(req.body.renewPeriod ? { ...period, usedThisPeriod: 0, reservedThisPeriod: 0 } : {}) }, ...(req.body.renewPeriod ? {} : { $setOnInsert: period }) }, { upsert: !existing, new: true });
  if (!subscription) throw new ApiError(409, "Wait for pending SMS deliveries before renewing");
  await SmsSubscription.updateOne({ _id: subscription._id }, { $set: { adminEnabled: req.body.status === "active", activatedBy: req.user!._id, activatedAt: new Date() } });
  res.json({ data: await SmsSubscription.findById(subscription._id) });
}));
router.post("/:businessId/request", asyncHandler(async (req, res) => {
  const business = await owned(String(req.params.businessId), req.user!._id);
  const now = new Date();
  const subscription = await SmsSubscription.findOneAndUpdate({ businessId: business._id }, { $set: { requestedAt: now }, $setOnInsert: { status: "paused", periodStart: now, periodEnd: new Date(Date.now() + 30 * 86400000) } }, { upsert: true, new: true });
  res.status(202).json({ data: subscription });
}));
export default router;
