import { Types } from "mongoose";
import Booking from "../models/Booking";
import Business from "../models/Business";
import User from "../models/User";
import Client from "../models/Client";
import StaffProfile from "../models/StaffProfile";
import Service from "../models/Service";
import SmsSubscription from "../models/SmsSubscription";
import SmsMessage from "../models/SmsMessage";
import { getNotificationQueue, getReminderQueue, getSmsQueue } from "../jobs/queue";
import { normalizeSmsPhone, smsMode, smsProvider } from "./sms-provider";
import { saveInboxNotification, scheduleKey, deliverPendingNotifications } from "./notification-inbox.service";

export type BookingEvent = "booking_created" | "booking_confirmed" | "booking_cancelled" | `booking_rescheduled:${string}`;
const options = (jobId: string) => ({ jobId, attempts: 5, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: false, removeOnFail: false });
const resolveUser = (id: string) => User.findOne({ $or: [{ firebaseUid: id }, ...(Types.ObjectId.isValid(id) ? [{ _id: id }] : [])] }).lean();
async function bounded<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([work, new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("notification_queue_timeout")), 5000); })]); }
  finally { if (timer) clearTimeout(timer); }
}

export async function enqueueBookingSms(bookingId: string, event: BookingEvent) {
  if (event !== "booking_created" && event !== "booking_confirmed") return;
  const booking = await Booking.findById(bookingId).populate({ path: "serviceIds", select: "name", model: Service }).lean();
  if (!booking) return;
  const business = await Business.findById(booking.businessId).lean();
  if (!business) return;
  const subscription = await SmsSubscription.findOne({ businessId: business._id, adminEnabled: true }).lean();
  if (!subscription || !["active", "trial"].includes(subscription.status || "") || !subscription.consentAt || subscription.periodEnd <= new Date() || !subscription.enabledEvents.includes(event)) return;
  const recipients = new Set<string>();
  const owner = await User.findById(business.ownerId).lean();
  const main = normalizeSmsPhone(business.smsContactPhone || (business.type === "independent" ? owner?.phoneNumber : undefined));
  if (main) recipients.add(main);
  if (business.type === "shop") {
    const staffIds = [...new Set([booking.staffId, ...booking.staffPlan.map(p => p.staffId)])];
    for (const id of staffIds) {
      const profile = await StaffProfile.findOne({ businessId: business._id, staffId: id, isActive: true }).lean();
      const staff = profile ? await resolveUser(String(profile.staffId)) : null;
      const phone = normalizeSmsPhone(staff?.phoneNumber);
      if (phone) recipients.add(phone);
      else console.warn("staff_sms_skipped", { bookingId, reason: "no_phone" });
    }
  }
  const customer = booking.clientId ? await Client.findById(booking.clientId).lean() : await resolveUser(String(booking.userId));
  const serviceNames = (booking.serviceIds as unknown as Array<{ name?: string }>).map(s => s.name || "Service").join(", ").slice(0, 90);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(booking.startTime);
  const clean = (value: string) => value.replace(/[\r\n]/g, " ").slice(0, 70);
  const body = `Zolmi: ${event === "booking_created" ? "New booking" : "Booking confirmed"} at ${clean(business.name)}. ${serviceNames}. ${date} (EAT). Customer: ${clean(customer?.fullName || "Customer")} ${normalizeSmsPhone(customer?.phoneNumber) || ""}. Ref: ${bookingId.slice(-8)}.`;
  for (const phone of recipients) {
    const idempotencyKey = `${bookingId}-${event}-${phone.slice(1)}`;
    await SmsMessage.updateOne({ idempotencyKey }, { $setOnInsert: { businessId: business._id, bookingId, toPhone: phone, body, event, status: "queued" } }, { upsert: true });
  }
}

export async function notifyBookingEvent(bookingId: string, event: BookingEvent) {
  // A saved event survives Redis outages and process restarts; delivery never changes the booking result.
  try {
    await Booking.updateOne({ _id: bookingId }, { $addToSet: { notificationEvents: event } });
    void dispatchBookingEvent(bookingId, event).catch(() => console.warn("booking_notification_deferred", { bookingId, event }));
  } catch {
    console.warn("booking_notification_event_save_failed", { bookingId, event });
  }
}

export async function dispatchBookingEvent(bookingId: string, event: BookingEvent, remindersOnly = false) {
  const booking = await Booking.findById(bookingId).lean();
  if (!booking || (!remindersOnly && booking.notificationDispatched?.includes(event))) return;
  const business = await Business.findById(booking.businessId).lean();
  if (!business) {
    await Booking.updateOne({ _id: bookingId }, { $addToSet: { notificationDispatched: event } });
    return;
  }
  const recipients = new Map<string, { audience: string; aliases: string[] }>();
  recipients.set(String(business.ownerId), { audience: business.type === "independent" ? "independent" : "owner", aliases: [] });
  const customer = await resolveUser(String(booking.userId));
  if (customer) recipients.set(String(customer._id), { audience: "customer", aliases: [] });
  if (business.type === "shop") {
    for (const id of new Set([booking.staffId, ...booking.staffPlan.map(p => p.staffId)])) {
      const staff = await resolveUser(id);
      if (!staff || recipients.has(String(staff._id))) continue;
      const aliases = [id, String(staff._id), staff.firebaseUid];
      if (await StaffProfile.exists({ businessId: business._id, isActive: true, staffId: { $in: aliases } })) {
        recipients.set(String(staff._id), { audience: "staff", aliases });
      }
    }
  }
  const type = event.split(":")[0];
  const messages: Record<string, [string, string]> = {
    booking_created: ["New appointment", "An appointment has been booked."],
    booking_confirmed: ["Booking confirmed", "The appointment is confirmed."],
    booking_cancelled: ["Booking cancelled", "The appointment has been cancelled."],
    booking_rescheduled: ["Booking updated", "The appointment time or professional has changed."],
  };
  const key = scheduleKey(booking);
  for (const [userId, recipient] of recipients) {
    let itemType = type;
    let itemKey = event;
    if (type === "booking_created" && recipient.audience === "customer" && booking.status === "confirmed") {
      itemType = "booking_confirmed"; itemKey = "booking_confirmed";
    }
    const [title, body] = messages[itemType];
    if (!remindersOnly) await saveInboxNotification({ userId, eventKey: `${bookingId}:${itemKey}`, type: itemType, title, body,
      bookingId, businessId: String(business._id), audience: recipient.audience });
    if (booking.status === "confirmed" && !booking.completedAt && type !== "booking_cancelled") {
      const segments = booking.staffPlan.filter(p => recipient.aliases.includes(p.staffId));
      const start = segments.length ? new Date(Math.min(...segments.map(p => p.startTime.getTime()))) : booking.startTime;
      if (start > new Date()) {
        const revision = booking.notificationEvents?.filter(e => e.startsWith("booking_rescheduled:")).at(-1) || "initial";
        for (const phase of ["hour", "start"] as const) {
          // A booking made less than an hour ahead already emits its creation/confirmation alert.
          const availableAt = new Date(start.getTime() - (phase === "hour" ? 3600000 : 0));
          if (phase === "hour" && availableAt <= new Date()) continue;
          await saveInboxNotification({ userId,
            eventKey: phase === "hour" ? `${bookingId}:reminder:${key}:${revision}` : `${bookingId}:start:${key}:${revision}`,
            type: phase === "hour" ? "booking_reminder" : "booking_start",
            title: phase === "hour" ? "Appointment in one hour" : "Appointment starting now",
            body: phase === "hour" ? "Your appointment starts in one hour." : "It is time for your appointment.",
            bookingId, businessId: String(business._id), audience: recipient.audience,
            scheduleKey: key, staffAliases: recipient.aliases, appointmentAt: start, availableAt });
        }
      }
    }
  }
  if (remindersOnly) return;
  await enqueueBookingSms(bookingId, event);
  await Booking.updateOne({ _id: bookingId }, { $addToSet: { notificationDispatched: event } });
}

let running = false;
let reminderCursor: Types.ObjectId | undefined;
export function startBookingNotificationRecovery() {
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await deliverPendingNotifications();
      // Backfill existing appointments, including after deployment or lost Redis state.
      // Bounded cursor scan does not starve later appointments or block booking requests.
      const upcoming = await Booking.find({ status: "confirmed", completedAt: null, startTime: { $gt: new Date() },
        ...(reminderCursor ? { _id: { $gt: reminderCursor } } : {}) }).sort({ _id: 1 }).limit(20).select("_id").lean();
      for (const booking of upcoming) await dispatchBookingEvent(String(booking._id), "booking_confirmed", true);
      reminderCursor = upcoming.length === 20 ? upcoming.at(-1)!._id : undefined;
      const bookings = await Booking.find({ notificationEvents: { $exists: true, $ne: [] }, $expr: { $gt: [{ $size: { $setDifference: [{ $ifNull: ["$notificationEvents", []] }, { $ifNull: ["$notificationDispatched", []] }] } }, 0] } }).limit(100).lean();
      for (const booking of bookings) for (const event of booking.notificationEvents || []) {
        if (!booking.notificationDispatched?.includes(event)) await dispatchBookingEvent(String(booking._id), event as BookingEvent).catch(() => undefined);
      }
      const messages = await SmsMessage.find({ $or: [{ status: "queued" }, { status: "sending", leaseUntil: { $lt: new Date() } }] }).limit(100).lean();
      for (const message of messages) {
        const queue = getSmsQueue();
        const id = `sms-${message._id}`;
        const existing = await queue.getJob(id);
        const state = await existing?.getState();
        // An interrupted sender may leave a completed queue job and an expired Mongo lease.
        if (existing && (state === "completed" || state === "failed")) await existing.remove();
        await bounded(queue.add("send", { messageId: String(message._id) }, options(id)));
      }
      if (smsMode() === "live") {
        const accepted = await SmsMessage.find({ status: { $in: ["accepted", "sent"] }, providerAcceptedAt: { $gt: new Date(Date.now() - 7 * 86400000) }, $or: [{ statusCheckedAt: { $exists: false } }, { statusCheckedAt: { $lt: new Date(Date.now() - 60000) } }] }).limit(20).lean();
        for (const message of accepted) {
          try {
            const status = await smsProvider.status!(message.providerMessageId!);
            await SmsMessage.updateOne({ _id: message._id, status: { $ne: "delivered" } }, { $set: { status, statusCheckedAt: new Date() } });
          } catch { await SmsMessage.updateOne({ _id: message._id }, { $set: { statusCheckedAt: new Date() } }); }
        }
      }
    } catch { console.warn("notification_recovery_deferred"); }
    finally { running = false; }
  };
  void run();
  const timer = setInterval(() => void run(), 15000);
  timer.unref();
  return timer;
}
