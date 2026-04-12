import { createHash, randomUUID } from "node:crypto";
import { Types } from "mongoose";
import Notification from "../models/Notification";
import Booking from "../models/Booking";
import StaffProfile from "../models/StaffProfile";
import User from "../models/User";
import Business from "../models/Business";
import ApiError from "../utils/ApiError";
import { sendPushToUser } from "./notification.service";

export function scheduleKey(booking: any): string {
  return createHash("sha256").update(JSON.stringify([
    booking.notificationEvents?.filter((event: string) => event.startsWith("booking_rescheduled:")).at(-1) || "initial",
    new Date(booking.startTime).toISOString(), new Date(booking.endTime).toISOString(), booking.staffId,
    (booking.staffPlan || []).map((p: any) => [p.staffId, String(p.serviceId), new Date(p.startTime).toISOString(), new Date(p.endTime).toISOString()]),
  ])).digest("hex").slice(0, 24);
}

export async function saveInboxNotification(input: {
  userId: string; eventKey: string; type: string; title: string; body: string;
  bookingId: string; businessId: string; audience: string;
  availableAt?: Date; scheduleKey?: string; staffAliases?: string[]; appointmentAt?: Date;
}) {
  if (!await User.exists({ _id: input.userId, isBanned: { $ne: true }, deletionPendingAt: null })) return null;
  const availableAt = input.availableAt || new Date();
  try {
    return await Notification.findOneAndUpdate({ userId: input.userId, eventKey: input.eventKey },
      { $setOnInsert: { ...input, availableAt, nextAttemptAt: availableAt,
        ...(!["booking_reminder", "booking_start"].includes(input.type) ? { publishedAt: new Date() } : {}) } },
      { upsert: true, returnDocument: "after" });
  } catch (error: any) {
    if (error.code !== 11000) throw error;
    return Notification.findOne({ userId: input.userId, eventKey: input.eventKey });
  }
}

export const publicNotification = (row: any) => ({
  id: String(row._id), type: row.type, title: row.title, body: row.body,
  createdAt: row.publishedAt, appointmentAt: row.appointmentAt || null, readAt: row.readAt || null,
  destination: { kind: row.type === 'booking_sync_conflict' ? 'offline_sync' : "booking", bookingId: String(row.bookingId), businessId: String(row.businessId), audience: row.audience },
});
const visible = (userId: Types.ObjectId) => ({ userId, publishedAt: { $lte: new Date() }, deliveryStatus: { $ne: "obsolete" } });
export async function listInbox(userId: Types.ObjectId, cursor?: string, limit = 20) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError(400, "Invalid limit");
  let page: Record<string, any> = {};
  if (cursor) {
    try {
      const [date, id] = JSON.parse(Buffer.from(cursor, "base64url").toString());
      if (!Types.ObjectId.isValid(id) || !Number.isFinite(Date.parse(date))) throw Error();
      const at = new Date(date);
      page = { $or: [{ publishedAt: { $lt: at } }, { publishedAt: at, _id: { $lt: new Types.ObjectId(id) } }] };
    } catch { throw new ApiError(400, "Invalid cursor"); }
  }
  const rows = await Notification.find({ ...visible(userId), ...page }).sort({ publishedAt: -1, _id: -1 }).limit(limit + 1).lean();
  const more = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items: items.map(publicNotification), unreadCount: await unreadCount(userId),
    nextCursor: more && last ? Buffer.from(JSON.stringify([last.publishedAt, last._id])).toString("base64url") : null };
}
export const unreadCount = (userId: Types.ObjectId) => Notification.countDocuments({ ...visible(userId), readAt: null });
export async function readNotification(userId: Types.ObjectId, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "Notification not found");
  const filter = { ...visible(userId), _id: id };
  await Notification.updateOne({ ...filter, readAt: null }, { $set: { readAt: new Date() } });
  const row = await Notification.findOne(filter).lean();
  if (!row) throw new ApiError(404, "Notification not found");
  return publicNotification(row);
}
export async function readAllNotifications(userId: Types.ObjectId) {
  await Notification.updateMany({ ...visible(userId), readAt: null }, { $set: { readAt: new Date() } });
  return { unreadCount: await unreadCount(userId) };
}

export async function resolveNotificationDestination(userId: Types.ObjectId, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "Appointment unavailable");
  const item = await Notification.findOne({ ...visible(userId), _id: id }).lean();
  if (item?.type === 'booking_sync_conflict') {
    if (!await Business.exists({ _id: item.businessId, ownerId: userId })) throw new ApiError(404,'Business unavailable');
    return publicNotification(item).destination;
  }
  const booking = item && await Booking.findById(item.bookingId).lean();
  const business = booking && await Business.findById(booking.businessId).lean();
  const user = await User.findById(userId).select("firebaseUid").lean();
  if (!item || !booking || !business || !user) throw new ApiError(404, "Appointment unavailable");
  const aliases = [String(userId), user.firebaseUid];
  const customer = item.audience === "customer" && aliases.includes(String(booking.userId));
  const owner = ["owner", "independent"].includes(item.audience) && String(business.ownerId) === String(userId);
  const staff = item.audience === "staff" && (aliases.includes(booking.staffId) || booking.staffPlan.some(p => aliases.includes(p.staffId)))
    && await StaffProfile.exists({ businessId: business._id, staffId: { $in: aliases }, isActive: true });
  if (!customer && !owner && !staff) throw new ApiError(404, "Appointment unavailable");
  return publicNotification(item).destination;
}

export async function reminderIsCurrent(row: any, now = new Date()) {
  const booking = await Booking.findById(row.bookingId).lean();
  if (!booking || booking.status !== "confirmed" || booking.completedAt || scheduleKey(booking) !== row.scheduleKey) return false;
  if (!row.appointmentAt) return false;
  const appointmentAt = new Date(row.appointmentAt).getTime();
  // Start alerts may be delivered within five minutes, never hours after the appointment.
  if (row.type === "booking_start" ? now.getTime() > appointmentAt + 300000 : appointmentAt <= now.getTime()) return false;
  if (row.type === "booking_start" && now.getTime() < appointmentAt) return false;
  const user = await User.findById(row.userId).select("firebaseUid").lean();
  const business = await Business.findById(booking.businessId).select("ownerId").lean();
  if (!user || !business) return false;
  if (row.audience === "customer" && ![String(user._id),user.firebaseUid].includes(String(booking.userId))) return false;
  if (["owner","independent"].includes(row.audience) && String(business.ownerId) !== String(user._id)) return false;
  if (row.audience === "staff") {
    const aliases: string[] = row.staffAliases || [];
    if (!await StaffProfile.exists({ businessId: row.businessId, staffId: { $in: aliases }, isActive: true })) return false;
    if (!aliases.includes(booking.staffId) && !booking.staffPlan.some(p => aliases.includes(p.staffId))) return false;
    if (booking.staffProgress?.some(p => aliases.includes(p.staffId) && p.completedAt)) return false;
  }
  return true;
}

// Durable Mongo leases also work while Redis is unavailable. Push is at-least-once;
// stable notificationId lets clients suppress a repeated transport delivery.
export async function deliverPendingNotifications(sender = sendPushToUser) {
  const now = new Date();
  const candidates = await Notification.find({ nextAttemptAt: { $lte: now }, availableAt: { $lte: now },
    $or: [{ deliveryStatus: "pending" }, { deliveryStatus: "sending", leaseUntil: { $lte: now } }] }).sort({ nextAttemptAt: 1 }).limit(50).select("_id").lean();
  await Promise.all(candidates.map(async candidate => {
    const leaseId = randomUUID();
    const row = await Notification.findOneAndUpdate({ _id: candidate._id, nextAttemptAt: { $lte: now }, availableAt: { $lte: now },
      $or: [{ deliveryStatus: "pending" }, { deliveryStatus: "sending", leaseUntil: { $lte: now } }] },
    { $set: { deliveryStatus: "sending", leaseId, leaseUntil: new Date(Date.now() + 300000) }, $inc: { attempts: 1 } },
    { returnDocument: "after" }).select("+retryTokens");
    if (!row) return;
    const finish = (data: Record<string, unknown>) => Notification.updateOne({ _id: row._id, leaseId }, { $set: data, $unset: { leaseUntil: 1, leaseId: 1 } });
    try {
      if (row.attempts > 5) { await finish({ deliveryStatus: "failed", lastError: "lease_retry_limit" }); return; }
      const user = await User.findById(row.userId).select("isBanned deletionPendingAt").lean();
      if (!user || user.isBanned || user.deletionPendingAt || ["booking_reminder", "booking_start"].includes(row.type) && !await reminderIsCurrent(row)) {
        await finish({ deliveryStatus: "obsolete" }); return;
      }
      if (!row.publishedAt) await Notification.updateOne({ _id: row._id, leaseId }, { $set: { publishedAt: new Date() } });
      const result = await sender(String(row.userId), { notification: { title: row.title, body: row.body }, data: {
        notificationId: String(row._id), recipientId: String(row.userId), type: row.type,
        bookingId: String(row.bookingId), businessId: String(row.businessId), audience: row.audience, schemaVersion: "1",
      } }, row.retryTokens ?? undefined);
      if (result.retryTokens?.length) {
        await finish({ deliveryStatus: row.attempts >= 5 ? "failed" : "pending", retryTokens: result.retryTokens,
          nextAttemptAt: new Date(Date.now() + Math.min(3600000, 15000 * 2 ** row.attempts)), lastError: "push_delivery_retry" });
      } else await finish({ deliveryStatus: result.successCount ? "sent" : "skipped", retryTokens: [], lastError: "" });
    } catch {
      await finish({ deliveryStatus: row.attempts >= 5 ? "failed" : "pending",
        nextAttemptAt: new Date(Date.now() + Math.min(3600000, 15000 * 2 ** row.attempts)), lastError: "push_delivery_error" });
    }
  }));
}
