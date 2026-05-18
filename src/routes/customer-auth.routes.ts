import { Router } from "express";
import { authIdentityKey, httpLimit } from '../middlewares/traffic.middleware';
import { policies } from '../services/traffic-limit.service';
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import User from "../models/User";
import CustomerCredential from "../models/CustomerCredential";
import { getFirebaseAdmin } from "../config/firebase";
import authMiddleware from "../middlewares/auth.middleware";
import asyncHandler from "../utils/asyncHandler";
import ApiError from "../utils/ApiError";
import validate from "../middlewares/validate.middleware";
import { Joi } from "../validators/common";
import { customerPhone, hashCustomerPassword, checkCustomerPassword } from "../utils/customer-password";

const router = Router();
const limit = httpLimit(policies.authIdentity, authIdentityKey);
const password = Joi.string().min(8).max(128).required();
const phoneNumber = Joi.string().max(24).required();
function normalize(raw: string) { try { return customerPhone(raw); } catch { throw new ApiError(400, "Enter a valid Ethiopian phone number"); } }
function customerOnly(user: any) {
  if (!user || user.isBanned || user.deletionPendingAt || user.roles.length !== 1 || !user.roles.includes("customer")) throw new ApiError(401, "Invalid phone number or password");
}
router.post("/register", limit, validate(Joi.object({ phoneNumber, password, fullName: Joi.string().trim().min(2).max(100).required(), email: Joi.string().email().max(254).allow("").optional() })), asyncHandler(async (req, res) => {
  const phone = normalize(req.body.phoneNumber);
  const email = req.body.email?.trim().toLowerCase();
  await CustomerCredential.init();
  // Never claim or merge an existing account just by knowing its phone/email.
  if (await User.exists({ $or: [{ phoneNumber: { $in: [phone, `0${phone.slice(4)}`, phone.slice(4)] } }, ...(email ? [{ email }] : [])] }) || await CustomerCredential.exists({ phone })) throw new ApiError(409, "An account already exists. Use your existing sign-in, then set up phone login in Profile.");
  const uid = `customer-${randomUUID()}`;
  const passwordHash = await hashCustomerPassword(req.body.password);
  const admin = getFirebaseAdmin();
  await admin.auth().createUser({ uid, displayName: req.body.fullName });
  const session = await mongoose.startSession();
  let user: any;
  try {
    await session.withTransaction(async () => {
      [user] = await User.create([{ firebaseUid: uid, fullName: req.body.fullName, phoneNumber: phone, email: email || `${uid}@customers.elvezet.invalid`, roles: ["customer"], isVerified: false }], { session });
      await CustomerCredential.create([{ phone, userId: user._id, passwordHash }], { session });
    });
  } catch (error: any) {
    await admin.auth().deleteUser(uid).catch(() => undefined);
    if (error?.code === 11000) throw new ApiError(409, "An account already exists. Sign in instead.");
    throw error;
  } finally { await session.endSession(); }
  res.status(201).json({ data: { customToken: await admin.auth().createCustomToken(uid) } });
}));
router.post("/signin", limit, validate(Joi.object({ phoneNumber, password: Joi.string().max(128).required() })), asyncHandler(async (req, res) => {
  const phone = normalize(req.body.phoneNumber);
  const credential = await CustomerCredential.findOne({ phone }).select("+passwordHash");
  const valid = await checkCustomerPassword(req.body.password, credential?.passwordHash);
  const user = credential ? await User.findById(credential.userId) : null;
  if (credential?.lockedUntil && credential.lockedUntil.getTime() > Date.now()) throw new ApiError(401, "Invalid phone number or password. If you have tried repeatedly, wait 15 minutes.");
  if (!valid) {
    if (credential) {
      if (credential.lockedUntil && credential.lockedUntil.getTime() <= Date.now()) await CustomerCredential.updateOne({ _id: credential._id, lockedUntil: { $lte: new Date() } }, { $set: { failedAttempts: 0 }, $unset: { lockedUntil: 1 } });
      const failed = await CustomerCredential.findByIdAndUpdate(credential._id, { $inc: { failedAttempts: 1 } }, { new: true });
      if (failed && failed.failedAttempts >= 10) await CustomerCredential.updateOne({ _id: credential._id }, { $set: { lockedUntil: new Date(Date.now() + 15 * 60000) } });
    }
    throw new ApiError(401, "Invalid phone number or password");
  }
  customerOnly(user);
  await CustomerCredential.updateOne({ _id: credential!._id }, { $set: { failedAttempts: 0 }, $unset: { lockedUntil: 1 } });
  res.json({ data: { customToken: await getFirebaseAdmin().auth().createCustomToken(user!.firebaseUid) } });
}));
// Existing customers must prove their current session before adding phone login.
router.put("/password", limit, authMiddleware, validate(Joi.object({ password, phoneNumber: Joi.string().max(24).optional(), currentPassword: Joi.string().max(128).optional() })), asyncHandler(async (req, res) => {
  await CustomerCredential.init();
  customerOnly(req.user);
  const decoded = await getFirebaseAdmin().auth().verifyIdToken(req.get("authorization")!.replace(/^Bearer\s+/i, ""), true);
  if (Date.now() / 1000 - decoded.auth_time > 300) throw new ApiError(401, "Sign in again before setting a password");
  const credential = await CustomerCredential.findOne({ userId: req.user!._id }).select("+passwordHash");
  const phone = normalize(req.body.phoneNumber || credential?.phone || req.user!.phoneNumber || "");
  if (credential && credential.phone !== phone) throw new ApiError(409, "Contact support before changing a phone login number");
  if (credential && !await checkCustomerPassword(req.body.currentPassword || "", credential.passwordHash)) throw new ApiError(401, "Current password is incorrect");
  const aliases = [phone, `0${phone.slice(4)}`, phone.slice(4)];
  if (await User.exists({ _id: { $ne: req.user!._id }, phoneNumber: { $in: aliases } })) throw new ApiError(409, "This number is shared with another account. Contact support.");
  try {
    const passwordHash = await hashCustomerPassword(req.body.password);
    const session = await mongoose.startSession();
    try { await session.withTransaction(async () => {
      await CustomerCredential.findOneAndUpdate({ userId: req.user!._id }, { $set: { phone, passwordHash, failedAttempts: 0 }, $unset: { lockedUntil: 1 } }, { upsert: true, runValidators: true, session });
      await User.updateOne({ _id: req.user!._id }, { $set: { phoneNumber: phone } }, { session });
    }); } finally { await session.endSession(); }
  } catch (error: any) { if (error?.code === 11000) throw new ApiError(409, "This phone number already has a login"); throw error; }
  await getFirebaseAdmin().auth().revokeRefreshTokens(req.user!.firebaseUid);
  res.json({ data: { updated: true, customToken: await getFirebaseAdmin().auth().createCustomToken(req.user!.firebaseUid) } });
}));
export default router;
