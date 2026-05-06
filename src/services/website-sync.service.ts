import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import Joi from 'joi';
import Business from '../models/Business';
import Booking from '../models/Booking';
import Service from '../models/Service';
import Product from '../models/Product';
import Client from '../models/Client';
import StaffProfile from '../models/StaffProfile';
import Availability from '../models/Availability';
import WebsiteMutation from '../models/WebsiteMutation';
import OfflineConflict from '../models/OfflineConflict';
import ApiError from '../utils/ApiError';
import * as rules from '../validators/dashboard.validator';
import { checkoutBookingSchema } from '../validators/booking.validator';
import { createWalkInBooking, checkoutBooking, updateBookingAppointment } from './booking.service';
import { createService } from './service.service';
import { createBusinessProduct, updateBusinessProduct, deleteBusinessProduct, updateBusinessService, deleteBusinessService, updateClientNotes, updateDashboardStaff } from './dashboard.service';
import { offlineTransaction } from './offline-transaction';
import { bookingOfflineVersion } from '../utils/website-offline-version';

mongoose.set('transactionAsyncLocalStorage', true);
export type WebsiteChange = {
  key: string; method: string; path: string; body?: Record<string, any>;
  base?: { id: string; updatedAt: string; version?: string };
  expectedTotal?: number;
  supersedes?: string;
  resolveConflictId?: string;
};
const parse = (schema: Joi.Schema, body: unknown) => {
  const { error, value } = schema.validate(body ?? {}, { abortEarly: false, stripUnknown: true });
  if (error) throw new ApiError(400, error.message);
  return value;
};
const canonical = (value: any): string => JSON.stringify(value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(v => JSON.parse(canonical(v))) : Object.fromEntries(Object.keys(value).sort().map(k => [k, JSON.parse(canonical(value[k]))]))
  : value ?? null);

export async function syncWebsiteChange(actor: { _id: any; roles: string[] }, shopId: string, change: WebsiteChange) {
  if (!/^[a-f\d]{24}$/i.test(shopId) || !/^[\w-]{16,100}$/.test(change.key || '')) throw new ApiError(400, 'Invalid sync request');
  const shop = await Business.findById(shopId);
  if (!shop) throw new ApiError(403, 'Business unavailable');
  const isOwner = String(shop.ownerId) === String(actor._id);
  const aliases = [String(actor._id), (actor as any).firebaseUid].filter(Boolean);
  const staff = !isOwner && actor.roles.includes('staff') ? await StaffProfile.findOne({ businessId: shopId, staffId: { $in: aliases }, isActive: true }) : null;
  if (!isOwner && (!staff || staff.permissionLevel === 'low' || change.method !== 'POST' || change.path !== `/dashboard/${shopId}/walk-in`)) throw new ApiError(403, 'This workspace does not permit that offline operation');
  const hash = createHash('sha256').update(canonical({ shopId, ...change })).digest('hex');
  await Promise.all([WebsiteMutation.init(), OfflineConflict.init()]);
  const previous = await WebsiteMutation.findOne({ actor: String(actor._id), key: change.key }).lean();
  if (previous) {
    if (previous.hash === 'superseded') return previous.result;
    if (previous.hash !== hash) throw new ApiError(409, 'This sync key was used for a different change');
    return previous.result;
  }
  const prefix = `/dashboard/${shopId}`;
  const method = change.method.toUpperCase();
  const suffix = change.path.startsWith(prefix + '/') ? change.path.slice(prefix.length) : '';
  const item = /^\/(services|products|staff)\/([\w-]{1,128})(?:\/(visibility|archive))?$/.exec(suffix);
  const notes = /^\/clients\/([a-f\d]{24})\/notes$/.exec(suffix);
  const appointment = /^\/bookings\/([a-f\d]{24})$/.exec(suffix);
  const checkout = /^\/bookings\/([a-f\d]{24})\/checkout$/.exec(change.path);
  const callbacks: Array<() => void | Promise<void>> = [];
  let result: any;
  try {
    await mongoose.connection.transaction(async session => {
      callbacks.length = 0;
      await offlineTransaction.run({ session, afterCommit: callbacks }, async () => {
        // Lock the business row against other website sync transactions.
        // Record-level version checks below also catch intervening normal API edits.
        const ownership = await Business.updateOne({ _id: shopId, ownerId: shop.ownerId }, { $inc: { __v: 1 } });
        if (!ownership.matchedCount) throw new ApiError(403, 'Business ownership changed. This work cannot be synchronized by this account.');
        if (!isOwner && !await StaffProfile.exists({ _id: staff!._id, businessId: shopId, isActive: true, permissionLevel: { $in: ['medium', 'high'] } })) throw new ApiError(403, 'Your appointment permission was removed');
        const duplicate = await WebsiteMutation.findOne({ actor: String(actor._id), key: change.key });
        if (duplicate) {
          if (duplicate.hash === 'superseded') { result = duplicate.result; return; }
          if (duplicate.hash !== hash) throw new ApiError(409, 'This sync key was used for a different change');
          result = duplicate.result; return;
        }
        const issue = change.resolveConflictId ? await OfflineConflict.findOne({ _id: change.resolveConflictId, businessId: shopId, state: 'open' }) : change.supersedes ? await OfflineConflict.findOne({ actor: String(actor._id), key: change.supersedes, businessId: shopId, state: 'open' }) : null;
        if (change.resolveConflictId && (!issue || (!isOwner && issue.actor !== String(actor._id)))) throw new ApiError(403, 'This account cannot resolve that conflict');
        const originalKey = issue?.key || change.supersedes;
        const originalActor = issue?.actor || String(actor._id);
        if (originalKey && (originalKey === change.key || await WebsiteMutation.exists({ actor: originalActor, key: originalKey }))) throw new ApiError(409, 'The original operation is already confirmed or replaced. Reload before resolving it.');
        const guard = async (model: any, id: string, filter: any = { _id: id, businessId: shopId }) => {
          const current = await model.findOne(filter).lean();
          if (!current) throw new ApiError(409, 'This record was removed or is no longer in this business. Review the saved change.');
          if (!change.base || change.base.id !== id || !change.base.updatedAt ||
              (model.modelName === 'Booking' ? !change.base.version || bookingOfflineVersion(current) !== change.base.version : new Date(current.updatedAt).toISOString() !== change.base.updatedAt)) {
            throw new ApiError(409, 'This record changed on another device. Review the current version before applying your saved change.');
          }
        };
        if (suffix === '/walk-in' && method === 'POST') {
          const body = parse(rules.walkInBodySchema, change.body);
          if (!['cash', 'in-shop'].includes(body.paymentMethod)) throw new ApiError(400, 'Online payments require internet');
          if (!isOwner && (body.staffPlan.some((segment: any) => segment.staffId !== staff!.staffId) || body.serviceIds.some((id: string) => !staff!.services.some(service => String(service) === id)))) throw new ApiError(403, 'Staff can create appointments only for their own assigned services');
          const services = await Service.find({ businessId: shopId, _id: { $in: body.serviceIds }, isActive: { $ne: false } });
          if (services.length !== body.serviceIds.length) throw new ApiError(409, 'A selected service is no longer available');
          for (const segment of body.staffPlan) {
            const service = services.find(service => String(service._id) === segment.serviceId);
            if (!service || +new Date(segment.endTime) - +new Date(segment.startTime) !== service.duration * 60000) throw new ApiError(409, 'Service duration changed. Review the appointment before syncing');
            const from = new Date(+new Date(segment.startTime) + 3 * 3600000), to = new Date(+new Date(segment.endTime) + 3 * 3600000);
            const day = shop.weeklySchedule?.find(day => day.dayOfWeek === from.getUTCDay());
            const clock = (date: Date) => date.toISOString().slice(11, 16);
            const periods = await Availability.find({ staffId: segment.staffId, dayOfWeek: from.getUTCDay() }).lean();
            if (day?.isOpen === false || from.toISOString().slice(0,10) !== to.toISOString().slice(0,10) || clock(from) < (day?.openingTime || shop.openingTime || '00:00') || clock(to) > (day?.closingTime || shop.closingTime || '23:59') || (periods.length > 0 && !periods.some(period => period.startTime <= clock(from) && period.endTime >= clock(to)))) throw new ApiError(409, 'Appointment is outside working hours. Choose another time');
          }
          result = await createWalkInBooking({ ...body, businessId: shopId });
          await result.populate([{ path: 'clientId', select: 'fullName phoneNumber email' }, { path: 'serviceIds', select: 'name duration basePrice' }]);
        } else if (checkout && method === 'PATCH') {
          const body = parse(checkoutBookingSchema, change.body);
          if (!['cash', 'in-shop'].includes(body.paymentMethod)) throw new ApiError(400, 'Receipt verification and online payments require internet');
          await guard(Booking, checkout[1]);
          result = await checkoutBooking({ ...body, bookingId: checkout[1], ownerId: actor._id });
          if (change.expectedTotal === undefined || Math.round(result.totalAmount * 100) !== Math.round(change.expectedTotal * 100)) throw new ApiError(409, 'Prices changed while offline. Review the payment amount before recording it.');
        } else if (suffix === '/services' && method === 'POST') {
          result = await createService({ ...parse(rules.createServiceBodySchema, change.body), businessId: shopId, ownerId: actor._id });
        } else if (suffix === '/products' && method === 'POST') {
          result = await createBusinessProduct(shopId, parse(rules.createProductBodySchema, change.body));
        } else if (item && ['PATCH', 'DELETE'].includes(method)) {
          const [, kind, id, action] = item;
          if (kind !== 'staff' && !/^[a-f\d]{24}$/.test(id)) throw new ApiError(400, 'Invalid record');
          if (kind !== 'staff' && action) throw new ApiError(400, 'Unsupported change');
          if (kind === 'services') {
            await guard(Service, id);
            result = method === 'DELETE' ? await deleteBusinessService(id, shopId) : await updateBusinessService(id, shopId, parse(rules.updateServiceBodySchema, change.body));
          } else if (kind === 'products') {
            await guard(Product, id);
            result = method === 'DELETE' ? await deleteBusinessProduct(id, shopId) : await updateBusinessProduct(id, shopId, parse(rules.updateProductBodySchema, change.body));
          } else {
            if (method !== 'PATCH') throw new ApiError(400, 'Unsupported change');
            const body = action === 'archive' ? { isActive: false } : parse(action === 'visibility' ? rules.setStaffVisibilityBodySchema : rules.updateStaffBodySchema, change.body);
            if (['serviceCommission', 'productCommission', 'hourlyWage', 'permissionLevel', 'email', 'password', 'firstName', 'lastName', 'fullName', 'phoneNumber'].some(k => k in (change.body || {}))) throw new ApiError(400, 'Account, permission and commission changes require internet');
            const profile = await StaffProfile.findOne({ businessId: shopId, $or: [{ staffId: id }, ...(/^[a-f\d]{24}$/.test(id) ? [{ _id: id }] : [])] }).lean();
            if (!profile) throw new ApiError(409, 'Staff profile no longer exists');
            await guard(StaffProfile, change.base?.id || id, { _id: profile._id, businessId: shopId });
            result = await updateDashboardStaff(profile.staffId, shopId, body);
          }
        } else if (notes && method === 'PATCH') {
          await guard(Client, notes[1]);
          result = await updateClientNotes(notes[1], shopId, parse(rules.updateClientNotesBodySchema, change.body).notes);
        } else if (appointment && method === 'PATCH') {
          await guard(Booking, appointment[1]);
          result = await updateBookingAppointment({ ...parse(rules.updateBookingAppointmentBodySchema, change.body), businessId: shopId, bookingId: appointment[1], ownerId: actor._id });
        } else throw new ApiError(400, 'This action needs a live connection and cannot be queued');
        result = result ? JSON.parse(JSON.stringify(result)) : { deleted: true };
        if (result._id && result.startTime && result.endTime) result.offlineVersion = bookingOfflineVersion(result);
        await WebsiteMutation.create({ actor: String(actor._id), key: change.key, hash, result });
        if (originalKey) await WebsiteMutation.create({ actor: originalActor, key: originalKey, hash: 'superseded', result: { _id: result._id, updatedAt: result.updatedAt, offlineVersion: result.offlineVersion, resolvedByOwner: true } });
        if (issue) await OfflineConflict.updateOne({ _id: issue._id }, { $set: { state: 'resolved', resolvedBookingId: result._id, expireAt: new Date(Date.now() + 30 * 86400000) } });
      });
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      const duplicate = await WebsiteMutation.findOne({ actor: String(actor._id), key: change.key }).lean();
      if (duplicate?.hash === hash) return duplicate.result;
    }
    throw error;
  }
  // Transactions may retry. Side effects happen once, only after the commit.
  for (const callback of callbacks) {
    try { await callback(); } catch { console.warn('Website sync notification deferred'); }
  }
  return result;
}
