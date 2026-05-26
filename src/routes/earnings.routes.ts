import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware";
import asyncHandler from "../utils/asyncHandler";
import validate from "../middlewares/validate.middleware";
import { Joi } from "../validators/common";
import { earningsContext, earningsStatement } from "../services/earnings.service";
import { barberContext } from "../services/barber-workspace.service";
import Business from "../models/Business";
import StaffProfile from "../models/StaffProfile";
import User from "../models/User";
import { Types } from "mongoose";
import { moneyMinor } from "../utils/earnings";
import ApiError from "../utils/ApiError";

const router = Router();
router.use(authMiddleware);
const pageSchema = Joi.object({ page: Joi.number().integer().min(1).max(100000).default(1) });
router.get("/staff/me", validate(pageSchema, "query"), asyncHandler(async (req, res) => {
  const staff = await barberContext(req.user!._id, req.get("x-business-id"));
  res.json({ data: await earningsStatement(await earningsContext(String(staff.business._id), staff.profile.staffId), Number(req.query.page)) });
}));
router.get("/independent/me", validate(pageSchema, "query"), asyncHandler(async (req, res) => {
  const business = await Business.findOne({ ownerId: req.user!._id, type: "independent", ...(req.get("x-business-id") ? { _id: req.get("x-business-id") } : {}) });
  if (!business) throw new ApiError(403, "Independent workspace not found");
  res.json({ data: await earningsStatement(await earningsContext(String(business._id), "self"), Number(req.query.page)) });
}));
const ownerContext = async (req: any) => {
  const ctx = await earningsContext(req.params.businessId, req.params.beneficiary);
  if (String(ctx.business.ownerId) !== String(req.user._id)) throw new ApiError(403, "You do not own this business");
  return ctx;
};
router.get("/:businessId", asyncHandler(async (req, res) => {
  if (!Types.ObjectId.isValid(String(req.params.businessId))) throw new ApiError(400, "Invalid business");
  const business = await Business.findById(String(req.params.businessId)).lean();
  if (!business || String(business.ownerId) !== String(req.user!._id)) throw new ApiError(403, "You do not own this business");
  if (business.type === "independent") { res.json({ data: [{ beneficiary: "self", name: business.name, active: true }] }); return; }
  const profiles = await StaffProfile.find({ businessId: business._id }).select("staffId firstName lastName isActive").lean();
  const aliases = profiles.map(p => p.staffId);
  const users = await User.find({ $or: [{ firebaseUid: { $in: aliases } }, { _id: { $in: aliases.filter(Types.ObjectId.isValid) } }] }).select("fullName firebaseUid").lean();
  res.json({ data: profiles.map(p => ({ beneficiary: p.staffId, name: users.find(u => u.firebaseUid === p.staffId || String(u._id) === p.staffId)?.fullName || [p.firstName, p.lastName].filter(Boolean).join(" ") || "Staff", active: p.isActive })) });
}));
router.get("/:businessId/:beneficiary", validate(pageSchema, "query"), asyncHandler(async (req, res) => { res.json({ data: await earningsStatement(await ownerContext(req), Number(req.query.page)) }); }));
router.post("/:businessId/:beneficiary", validate(Joi.object({ type: Joi.string().valid("adjustment", "payout", "payout_reversal").required(), amount: Joi.number().min(-10000000).max(10000000).custom((value, helpers) => { try { moneyMinor(value); return value; } catch { return helpers.error("any.invalid"); } }).when("type", { is: "payout", then: Joi.number().greater(0) }).when("type", { is: "payout_reversal", then: Joi.forbidden(), otherwise: Joi.required() }), key: Joi.string().pattern(/^[a-zA-Z0-9_-]{16,100}$/).required(), reason: Joi.string().trim().min(3).max(500).required(), method: Joi.string().valid("cash", "bank", "telebirr", "other").when("type", { is: "payout", then: Joi.required(), otherwise: Joi.optional() }), reference: Joi.string().trim().max(150).allow("").optional(), reversesId: Joi.string().hex().length(24).when("type", { is: "payout_reversal", then: Joi.required(), otherwise: Joi.forbidden() }) })), asyncHandler(async (req, res) => {
  res.json({ data: await earningsStatement(await ownerContext(req), 1, { ...req.body, actorId: req.user!._id }) });
}));
export default router;
