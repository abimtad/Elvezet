import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import app from "../app";
import env from "../config/env";
import User from "../models/User";
import Business from "../models/Business";
import StaffProfile from "../models/StaffProfile";
import Booking from "../models/Booking";
import Service from "../models/Service";
import Availability from "../models/Availability";
import { ethiopianDay, dateWindow } from "../services/barber-workspace.service";

async function main() {
  process.env.NODE_ENV = "development";
  const database = `barber_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  await mongoose.connect(env.MONGO_URI, { dbName: database });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const request = async (path: string, uid?: string, method = "GET", body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, { method, headers: { "Content-Type": "application/json", ...(uid ? { "x-dev-user-id": uid } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const payload = response.status === 204 ? null : await response.json();
    return { status: response.status, data: payload?.data ?? payload };
  };
  try {
    const a = await User.create({ firebaseUid: "barber-test-a", fullName: "Barber A", email: "a@example.test", roles: ["staff"], phoneNumber: "+251911000001" });
    const b = await User.create({ firebaseUid: "barber-test-b", fullName: "Barber B", email: "b@example.test", roles: ["staff"] });
    const customer = await User.create({ firebaseUid: "barber-test-client", fullName: "Test Client", email: "client@example.test" });
    const shop = await Business.create({ name: "Test Shop", ownerId: new mongoose.Types.ObjectId(), type: "shop", location: { coordinates: [38, 9] }, homeLocation: { coordinates: [38, 9] }, openingTime: "00:00", closingTime: "23:59" });
    const service = await Service.create({ businessId: shop._id, name: "Haircut", duration: 30, basePrice: 200 });
    const profile = await StaffProfile.create({ staffId: a.firebaseUid, businessId: shop._id, services: [service._id], permissionLevel: "high", serviceCommission: { type: "fixed", value: 20 } });
    await StaffProfile.create({ staffId: String(b._id), businessId: shop._id, services: [service._id], permissionLevel: "low" });
    const now = new Date(), start = new Date(now.getTime() - 2 * 3600000), end = new Date(start.getTime() + 1800000);
    const shared = await Booking.create({ userId: String(customer._id), businessId: shop._id, staffId: String(a._id), serviceIds: [service._id], totalAmount: 400, status: "confirmed", paymentStatus: "unpaid", startTime: start, endTime: new Date(end.getTime() + 1800000), staffPlan: [{ staffId: String(a._id), serviceId: service._id, startTime: start, endTime: end }, { staffId: b.firebaseUid, serviceId: service._id, startTime: end, endTime: new Date(end.getTime() + 1800000) }] });
    const foreign = await Booking.create({ userId: String(customer._id), businessId: new mongoose.Types.ObjectId(), staffId: a.firebaseUid, serviceIds: [service._id], totalAmount: 200, status: "confirmed", startTime: start, endTime: end });
    assert.equal((await request('/barber/me')).status, 401);
    assert.equal((await request('/barber/me', customer.firebaseUid)).status, 409);
    assert.equal((await request('/barber/me', a.firebaseUid)).data.business.name, 'Test Shop');
    const from = ethiopianDay(new Date(now.getTime() - 86400000)), to = ethiopianDay(new Date(now.getTime() + 86400000));
    const list = await request(`/barber/bookings?from=${from}&to=${to}`, a.firebaseUid);
    assert.equal(list.status, 200); assert.equal(list.data.length, 1, 'Cross-business record is hidden');
    assert.equal(list.data[0].customer.name, 'Test Client'); assert.equal(list.data[0].commissionEstimate, 40);
    assert.equal(list.data[0].totalAmount, undefined, 'Staff API hides full shop totals');
    assert.equal((await request(`/barber/bookings/${foreign._id}`, a.firebaseUid, 'PATCH', { action: 'start' })).status, 404);
    assert.equal((await request(`/barber/bookings/${shared._id}`, a.firebaseUid, 'PATCH', { action: 'complete' })).status, 409);
    assert.equal((await request(`/barber/bookings/${shared._id}`, a.firebaseUid, 'PATCH', { action: 'start' })).status, 200);
    assert.equal((await request(`/barber/bookings/${shared._id}`, a.firebaseUid, 'PATCH', { action: 'complete' })).status, 200);
    assert.equal((await Booking.findById(shared._id))!.paymentStatus, 'unpaid');
    assert.equal((await Booking.findById(shared._id))!.completedAt, undefined, 'Second barber must complete own segment');
    assert.equal((await request(`/barber/bookings/${shared._id}`, b.firebaseUid, 'PATCH', { action: 'start' })).status, 200);
    assert.equal((await request(`/barber/bookings/${shared._id}`, b.firebaseUid, 'PATCH', { action: 'complete' })).status, 200);
    assert.ok((await Booking.findById(shared._id))!.completedAt);
    assert.equal((await request(`/barber/bookings/${shared._id}`, a.firebaseUid, 'PATCH', { action: 'complete' })).status, 409);
    const clients = await request('/barber/clients', a.firebaseUid);
    assert.equal(clients.status, 200); assert.equal(clients.data.total, 1);
    assert.equal((await request(`/barber/clients/u-${customer._id}/bookings`, a.firebaseUid)).data.length, 1);
    const entries = [0,1,2,3,4,5,6].map(dayOfWeek => ({ dayOfWeek, startTime: '09:00', endTime: '18:00' }));
    assert.equal((await request('/barber/schedule', a.firebaseUid, 'PUT', entries)).status, 200);
    assert.equal((await request('/barber/schedule', a.firebaseUid, 'PUT', entries)).status, 200);
    assert.equal((await request('/barber/schedule', a.firebaseUid)).data.length, 7);
    assert.equal((await request('/barber/schedule', a.firebaseUid, 'PUT', [entries[0], entries[0]])).status, 400);
    const tomorrow = dateWindow(ethiopianDay(new Date(now.getTime() + 2 * 86400000))).from;
    const future = new Date(tomorrow.getTime() + 10 * 3600000);
    const created = await request('/barber/bookings', a.firebaseUid, 'POST', { fullName: 'Walk-in Test', phoneNumber: '+251911000009', serviceIds: [String(service._id)], startTime: future.toISOString(), notes: 'Test note' });
    assert.equal(created.status, 201);
    assert.equal((await Booking.findById(created.data._id))!.paymentStatus, 'unpaid');
    assert.equal((await request(`/barber/bookings/${created.data._id}`, a.firebaseUid, 'PATCH', { action: 'start' })).status, 400);
    assert.equal((await request('/barber/bookings', b.firebaseUid, 'POST', { fullName: 'Not allowed', phoneNumber: '+251911000009', serviceIds: [String(service._id)], startTime: future.toISOString() })).status, 403);
    assert.equal((await request('/barber/absences', a.firebaseUid, 'POST', { startTime: future.toISOString(), endTime: new Date(future.getTime()+3600000).toISOString() })).status, 409);
    assert.equal((await request('/barber/schedule', a.firebaseUid, 'PUT', [])).status, 409);
    const absence = await request('/barber/absences', a.firebaseUid, 'POST', { startTime: new Date(future.getTime()+4*3600000).toISOString(), endTime: new Date(future.getTime()+5*3600000).toISOString(), reason: 'Test' });
    assert.equal(absence.status, 201);
    assert.equal((await request(`/barber/absences/${absence.data._id}`, b.firebaseUid, 'DELETE')).status, 404);
    assert.equal((await request(`/barber/absences/${absence.data._id}`, a.firebaseUid, 'DELETE')).status, 204);
    assert.equal((await request('/barber/profile', a.firebaseUid, 'PATCH', { fullName: 'Updated Barber', phoneNumber: '+251911000001', biography: 'Updated', specialties: ['Hair'] })).status, 200);
    assert.equal((await User.findById(a._id))!.fullName, 'Updated Barber');
    {
      const tinyPng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      );
      const form = new FormData();
      form.append(
        "avatar",
        new Blob([new Uint8Array(tinyPng)], { type: "image/png" }),
        "avatar.png",
      );
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/barber/me/avatar`, {
        method: "POST",
        headers: { "x-dev-user-id": a.firebaseUid },
        body: form,
      });
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.match(String(payload?.data?.profilePicture || ""), /\/uploads\/avatars\//);
      assert.ok((await StaffProfile.findById(profile._id))!.profilePicture?.startsWith("/uploads/avatars/"));
    }
    assert.equal((await request('/barber/visibility', a.firebaseUid, 'PATCH', { visible: false })).status, 200);
    assert.equal((await StaffProfile.findById(profile._id))!.isOnlineVisible, false);
    assert.equal((await request('/barber/inbox/read', a.firebaseUid, 'POST')).status, 204);
    assert.ok((await request('/barber/inbox', a.firebaseUid)).data.every((m: any) => !m.unread));
    assert.equal(await Availability.countDocuments({ staffId: a.firebaseUid }), 7);
    console.log('Barber workspace integration passed: identity aliases, shop isolation, shared service progress, payment integrity, clients, booking creation permissions, schedule, time off, avatar upload, profile, visibility and inbox.');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    assert.equal(mongoose.connection.name, database);
    if (!database.startsWith('barber_test_')) throw new Error('Unsafe cleanup');
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
