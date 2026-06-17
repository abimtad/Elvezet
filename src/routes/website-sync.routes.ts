import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware';
import asyncHandler from '../utils/asyncHandler';
import validate from '../middlewares/validate.middleware';
import Joi from 'joi';
import { syncWebsiteChange } from '../services/website-sync.service';
import OfflineConflict from '../models/OfflineConflict';
import WebsiteMutation from '../models/WebsiteMutation';
import Business from '../models/Business';
import StaffProfile from '../models/StaffProfile';
import mongoose from 'mongoose';
import ApiError from '../utils/ApiError';
import { createHash } from 'node:crypto';
import { saveInboxNotification } from '../services/notification-inbox.service';

const router = Router();
router.use(authMiddleware);
router.get('/operations/:key', asyncHandler(async (req, res) => {
  const operation = await WebsiteMutation.findOne({ actor: String(req.user!._id), key: req.params.key }).lean();
  res.setHeader('Cache-Control','private, no-store');
  res.json({ data: operation ? { state: 'resolved', result: { _id: operation.result?._id, updatedAt: operation.result?.updatedAt, offlineVersion: operation.result?.offlineVersion, cancelledLocal: operation.result?.cancelledLocal } } : { state: 'open' } });
}));
router.get('/conflicts', asyncHandler(async (req, res) => {
  const owned = await Business.find({ ownerId: req.user!._id }).select('_id').lean();
  const member = await StaffProfile.find({ staffId: { $in: [String(req.user!._id), req.user!.firebaseUid] }, isActive: true }).select('businessId').lean();
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: await OfflineConflict.find({ state: 'open', $or: [{ businessId: { $in: owned.map(b => b._id) } }, { actor: String(req.user!._id), businessId: { $in: member.map(s => s.businessId) } }] }).sort({ createdAt: 1 }).limit(150).lean() });
}));
router.delete('/:shopId/conflicts/:id', asyncHandler(async (req, res) => {
  const shop = await Business.findById(req.params.shopId);
  if (!shop) throw new ApiError(403, 'Business unavailable');
  await WebsiteMutation.init();
  await mongoose.connection.transaction(async () => {
    await Business.updateOne({ _id: shop._id }, { $inc: { __v: 1 } });
    const issue = await OfflineConflict.findOne({ _id: req.params.id, businessId: shop._id, state: 'open' });
    if (!issue) throw new ApiError(409, 'Conflict was already resolved');
    if (String(shop.ownerId) !== String(req.user!._id) && (issue.actor !== String(req.user!._id) || !await StaffProfile.exists({ businessId: shop._id, staffId: { $in:[String(req.user!._id),req.user!.firebaseUid] }, isActive:true }))) throw new ApiError(403, 'You cannot cancel this local conflict');
    if (await WebsiteMutation.exists({ actor: String(issue.actor), key: String(issue.key) })) throw new ApiError(409, 'Operation already confirmed');
    await WebsiteMutation.create({ actor: String(issue.actor), key: String(issue.key), hash: 'superseded', result: { cancelledLocal: true } });
    issue.state = 'cancelled'; issue.expireAt = new Date(Date.now() + 30 * 86400000); await issue.save();
  });
  res.json({ data: { cancelledLocal: true } });
}));
router.get('/capabilities', (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: { version: 1 } });
});
router.post('/:shopId', validate(Joi.object({
  key: Joi.string().pattern(/^[\w-]{16,100}$/).required(),
  method: Joi.string().valid('POST', 'PATCH', 'DELETE').required(),
  path: Joi.string().max(250).required(),
  body: Joi.object().unknown(true).optional(),
  expectedTotal: Joi.number().min(0).max(100000000).optional(),
  supersedes: Joi.string().pattern(/^[\w-]{16,100}$/).optional(),
  resolveConflictId: Joi.string().hex().length(24).optional(),
  base: Joi.object({ id: Joi.string().hex().length(24).required(), updatedAt: Joi.string().isoDate().required(), version: Joi.string().hex().length(64).optional() }).optional(),
})), asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const result = await syncWebsiteChange(req.user!, String(req.params.shopId), req.body);
    res.json({ data: result });
  } catch (error: any) {
    if (error.statusCode === 409 && req.body.path === `/dashboard/${req.params.shopId}/walk-in`) {
      const shop = await Business.findById(req.params.shopId);
      if (shop && (String(shop.ownerId) === String(req.user!._id) || await StaffProfile.exists({ businessId: shop._id, staffId: { $in: [String(req.user!._id), req.user!.firebaseUid] }, isActive: true }))) {
        await OfflineConflict.init();
        const issue = await OfflineConflict.findOneAndUpdate({ actor: String(req.user!._id), key: req.body.key }, { $setOnInsert: { businessId: shop._id, body: req.body.body, error: error.message } }, { upsert: true, new: true });
        await saveInboxNotification({ userId: String(shop.ownerId), eventKey: `offline-conflict:${issue!._id}`, type: 'booking_sync_conflict', title: 'Offline booking needs attention', body: 'A walk-in conflicts with the current schedule. Open Saved work to resolve it.', bookingId: createHash('sha256').update(String(issue!._id)).digest('hex').slice(0,24), businessId: String(shop._id), audience: shop.type === 'independent' ? 'independent' : 'owner' });
      }
    }
    throw error;
  }
}));
export default router;
