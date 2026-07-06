import "./isolated-test-env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import app from "../app";
import User from "../models/User";
import Booking from "../models/Booking";
import Business from "../models/Business";
import StaffProfile from "../models/StaffProfile";
import Notification from "../models/Notification";
import DeviceToken from "../models/DeviceToken";
import { dispatchBookingEvent } from "../services/booking-notifications.service";
import { deliverPendingNotifications, scheduleKey, reminderIsCurrent, saveInboxNotification } from "../services/notification-inbox.service";
import { saveDeviceToken, sendPushToUser } from "../services/notification.service";

async function main() {
  const database = `notifications_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  if (!process.env.ISOLATED_MONGO_MODULE) throw new Error("ISOLATED_MONGO_MODULE is required; hosted databases are forbidden");
  const { MongoMemoryServer } = require(process.env.ISOLATED_MONGO_MODULE);
  const isolated = await MongoMemoryServer.create({ binary: { downloadDir: process.env.ISOLATED_MONGO_BINARIES } });
  assert.match(isolated.getUri(), /^mongodb:\/\/127\.0\.0\.1:/);
  process.env.NODE_ENV = "development"; // Only the isolated local server uses development test identities.
  await mongoose.connect(isolated.getUri(), { dbName: database });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const request = async (path: string, user: string, method = "GET", body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, { method,
      headers: { "Content-Type": "application/json", "x-dev-user-id": user }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  };
  try {
    await Promise.all([User.init(), Booking.init(), Business.init(), StaffProfile.init(), Notification.init(), DeviceToken.init()]);
    const [owner, customer, other, staff] = await User.create([
      { firebaseUid: "notification-owner", fullName: "Owner", email: "owner@notify.test", roles: ["owner"] },
      { firebaseUid: "notification-customer", fullName: "Customer", email: "customer@notify.test" },
      { firebaseUid: "notification-other", fullName: "Other", email: "other@notify.test" },
      { firebaseUid: "notification-staff", fullName: "Staff", email: "staff@notify.test", roles: ["staff"] },
    ]);
    const shop = await Business.create({ name: "Notification Test Shop", ownerId: owner!._id, type: "shop",
      location: { type: "Point", coordinates: [38, 9] }, homeLocation: { type: "Point", coordinates: [38, 9] } });
    await StaffProfile.create({ businessId: shop._id, staffId: staff!.firebaseUid, isActive: true, services: [] });
    const booking = await Booking.create({ userId: String(customer!._id), businessId: shop._id, staffId: staff!.firebaseUid,
      serviceIds: [], totalAmount: 100, startTime: new Date(Date.now() + 7200000), endTime: new Date(Date.now() + 9000000), status: "confirmed" });
    const bookingId = String(booking._id), customerId = String(customer!._id), otherId = String(other!._id);
    await Promise.all([dispatchBookingEvent(bookingId, "booking_created"), dispatchBookingEvent(bookingId, "booking_created")]);
    assert.equal(await Notification.countDocuments({ type: "booking_reminder" }), 3);
    assert.equal(await Notification.countDocuments({ type: "booking_start" }), 3);
    const hour = await Notification.findOne({ type: "booking_reminder" }).lean();
    assert.equal(hour!.appointmentAt!.getTime() - hour!.availableAt.getTime(), 3600000);
    const startAlert = await Notification.findOne({ type: "booking_start", userId: customer!._id }).lean();
    assert.equal(startAlert!.availableAt.getTime(), booking.startTime.getTime());
    assert.equal(await reminderIsCurrent(startAlert, new Date(booking.startTime.getTime()-1)), false);
    assert.equal(await reminderIsCurrent(startAlert, booking.startTime), true);
    assert.equal(await reminderIsCurrent(startAlert, new Date(booking.startTime.getTime()+300001)), false);
    await dispatchBookingEvent(bookingId, "booking_confirmed", true);
    assert.equal(await Notification.countDocuments({ type: "booking_start" }), 3, "Backfill and concurrent events deduplicate");
    assert.equal(await Notification.countDocuments({ userId: customer!._id, type: "booking_confirmed" }), 1);
    await dispatchBookingEvent(bookingId, "booking_confirmed");
    assert.equal(await Notification.countDocuments({ userId: customer!._id, type: "booking_confirmed" }), 1, "Confirmation is deduplicated");

    // The inbox exists before any push delivery, and scheduled reminders are private until due.
    const inbox = await request("/users/me/notifications?limit=1", customerId);
    assert.equal(inbox.status, 200); assert.equal(inbox.data.items.length, 1); assert.equal(inbox.data.unreadCount, 1);
    const item = inbox.data.items[0];
    assert.equal((await request(`/users/me/notifications/${item.id}/read`, otherId, "PATCH")).status, 404);
    assert.equal((await request(`/users/me/notifications/${item.id}/destination`, otherId)).status, 404);
    assert.equal((await request(`/users/me/notifications/${item.id}/destination`, customerId)).data.bookingId, bookingId);
    assert.equal((await request("/users/me/notifications?limit=0", customerId)).status, 400);
    assert.equal((await request("/users/me/notifications?cursor=broken", customerId)).status, 400);
    await request(`/users/me/notifications/${item.id}/read`, customerId, "PATCH");
    assert.equal((await request("/users/me/notifications/unread-count", customerId)).data.unreadCount, 0);
    for (let i = 0; i < 3; i++) await saveInboxNotification({ userId: customerId, eventKey: `page-${i}`, type: "booking_created",
      title: "Title", body: "Body", bookingId, businessId: String(shop._id), audience: "customer" });
    const first = (await request("/users/me/notifications?limit=2", customerId)).data;
    const second = (await request(`/users/me/notifications?limit=2&cursor=${first.nextCursor}`, customerId)).data;
    assert.equal(new Set([...first.items, ...second.items].map(i => i.id)).size, 4);
    await request("/users/me/notifications/read-all", customerId, "POST");
    assert.equal((await request("/users/me/notifications/unread-count", customerId)).data.unreadCount, 0);

    // Rescheduling and staff changes invalidate old reminder fingerprints, cancellation suppresses them.
    const oldReminder = await Notification.findOne({ userId: staff!._id, type: "booking_reminder" }).lean();
    assert.equal(await reminderIsCurrent(oldReminder), true);
    booking.startTime = new Date(booking.startTime.getTime() + 3600000);
    booking.endTime = new Date(booking.endTime.getTime() + 3600000);
    await booking.save();
    const event = booking.notificationEvents!.at(-1)!;
    assert.ok(event.startsWith("booking_rescheduled:"));
    await dispatchBookingEvent(bookingId, event as `booking_rescheduled:${string}`);
    assert.equal(await reminderIsCurrent(oldReminder), false);
    assert.equal(await Notification.countDocuments({ userId: customer!._id, type: "booking_rescheduled" }), 1);
    const current = await Notification.findOne({ userId: staff!._id, scheduleKey: scheduleKey(booking) }).lean();
    await StaffProfile.updateOne({ staffId: staff!.firebaseUid }, { isActive: false });
    assert.equal(await reminderIsCurrent(current), false);
    booking.status = "cancelled"; await booking.save();
    await dispatchBookingEvent(bookingId, "booking_cancelled");
    assert.equal(await Notification.countDocuments({ userId: customer!._id, type: "booking_cancelled" }), 1);
    await Notification.updateMany({ type: { $in: ["booking_reminder", "booking_start"] } }, { availableAt: new Date(0), nextAttemptAt: new Date(0) });

    // No external push is sent: this sender verifies durable partial-retry behavior.
    const sent: string[] = [];
    let retry = true;
    const sender = async (_user: string, payload: any, tokens?: string[]) => {
      sent.push(payload.data.notificationId);
      if (retry) { retry = false; return { successCount: 1, failureCount: 1, retryTokens: ["retry-token"] }; }
      if (tokens) assert.deepEqual(tokens, ["retry-token"]);
      return { successCount: 1, failureCount: 0 };
    };
    await Promise.all([deliverPendingNotifications(sender), deliverPendingNotifications(sender)]);
    assert.equal(new Set(sent).size, sent.length, "Concurrent workers do not deliver the same lease");
    assert.equal(await Notification.countDocuments({ type: { $in: ["booking_reminder", "booking_start"] }, deliveryStatus: "obsolete" }), 12);
    const pending = await Notification.findOne({ deliveryStatus: "pending" }).select("+retryTokens");
    assert.deepEqual(pending!.retryTokens, ["retry-token"]);
    await Notification.updateOne({ _id: pending!._id }, { nextAttemptAt: new Date(0) });
    await deliverPendingNotifications(sender);
    assert.equal((await Notification.findById(pending!._id))!.deliveryStatus, "sent");
    await Notification.updateOne({ _id: pending!._id }, { deliveryStatus: "pending", attempts: 4, nextAttemptAt: new Date(0) });
    await deliverPendingNotifications(async () => { throw Error("simulated outage"); });
    assert.equal((await Notification.findById(pending!._id))!.deliveryStatus, "failed");

    // Atomic account reassignment + scoped logout cannot remove another user's token.
    await saveDeviceToken(customer!._id, "shared-device-token", "customer");
    await saveDeviceToken(other!._id, "shared-device-token", "customer");
    await request("/users/me/device-tokens", customerId, "DELETE", { fcmToken: "shared-device-token" });
    assert.equal(await DeviceToken.countDocuments({ userId: other!._id }), 1);
    await saveDeviceToken(customer!._id, "customer-device-token", "customer");
    await saveDeviceToken(customer!._id, "business-device-token", "business");
    let tokensSent: string[] = [];
    const transport = async (tokens: string[]) => { tokensSent = tokens; return { responses: tokens.map(() => ({ success: true })) }; };
    const payload = { notification: { title: "Test", body: "Test" }, data: { type: "booking_confirmed", audience: "customer" } };
    await sendPushToUser(customerId, payload, undefined, transport);
    assert.deepEqual(tokensSent, ["customer-device-token"]);
    await User.updateOne({ _id: customer!._id }, { "notificationPreferences.bookingUpdates": false });
    tokensSent = []; await sendPushToUser(customerId, payload, undefined, transport); assert.deepEqual(tokensSent, []);
    tokensSent = []; await sendPushToUser(customerId, { ...payload, data: { type: "marketing" } }, undefined, transport); assert.deepEqual(tokensSent, []);
    console.log("PASS notification inbox, events, access, reminders, leases, retries, tokens and preferences");
  } finally {
    assert.equal(mongoose.connection.name, database);
    assert.match(database, /^notifications_test_[a-f0-9]{16}$/);
    await mongoose.connection.dropDatabase();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await mongoose.disconnect();
    await isolated.stop();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
