import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import app from "../app";
import env from "../config/env";
import User from "../models/User";
import Availability from "../models/Availability";
import StaffProfile from "../models/StaffProfile";

async function main() {
  process.env.NODE_ENV = "development";
  const database = `independent_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  await mongoose.connect(env.MONGO_URI, { dbName: database });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const request = async (path: string, uid?: string, method = "GET", body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, {
      method, headers: { "Content-Type": "application/json", ...(uid ? { "x-dev-user-id": uid } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = response.status === 204 ? null : await response.json();
    return { status: response.status, data: payload?.data ?? payload };
  };
  try {
    const owner = await User.create({ firebaseUid: 'independent-test-owner', fullName: 'Test Barber', email: 'owner@example.test', roles: ['customer'] });
    const outsider = await User.create({ firebaseUid: 'independent-test-outsider', fullName: 'Other Owner', email: 'other@example.test', roles: ['owner'] });
    assert.equal((await request('/independent/me')).status, 401);
    const setup = await request('/independent/setup', owner.firebaseUid, 'POST', { name: 'Test Independent', addressString: 'Test Address', longitude: 38.75, latitude: 8.98 });
    assert.equal(setup.status, 201);
    const businessId = String(setup.data._id);
    assert.equal(setup.data.isVisible, false);
    assert.equal((await request('/independent/setup', owner.firebaseUid, 'POST', { name: 'Duplicate', addressString: 'Test', longitude: 0, latitude: 0 })).status, 409);
    assert.equal((await request('/independent/me', outsider.firebaseUid)).status, 404);
    const service = await request(`/services/${businessId}`, owner.firebaseUid, 'POST', { name: 'Haircut', duration: 30, basePrice: 200 });
    assert.equal(service.status, 201);
    const serviceId = String(service.data._id);
    assert.equal((await request(`/services/${serviceId}`, outsider.firebaseUid, 'PATCH', { basePrice: 1 })).status, 403);
    const start = new Date(); start.setDate(start.getDate() + 2); start.setHours(10, 0, 0, 0);
    const dayOfWeek = start.getDay();
    const schedule = [{ dayOfWeek, startTime: '09:00', endTime: '12:00' }, { dayOfWeek, startTime: '13:00', endTime: '18:00' }];
    assert.equal((await request('/independent/schedule', owner.firebaseUid, 'PUT', schedule)).status, 200);
    assert.equal((await request('/independent/schedule', owner.firebaseUid, 'PUT', schedule)).status, 200);
    assert.equal((await request('/independent/schedule', owner.firebaseUid, 'PUT', [schedule[0], schedule[0]])).status, 400);
    assert.equal((await request('/independent/schedule', owner.firebaseUid)).data.length, 2);
    assert.equal((await request(`/businesses/${businessId}`, owner.firebaseUid, 'PATCH', { isVisible: true, bookingBufferMinutes: 20, minimumNoticeMinutes: 0 })).status, 200);
    const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const slots = await request('/bookings/availability/check', undefined, 'POST', { shopId: businessId, date, serviceIds: [serviceId], skipNextAvailable: true });
    assert.equal(slots.status, 200);
    assert.ok(slots.data.availableSlots.length > 0);
    assert.equal(slots.data.availableSlots[0].staffPlan[0].staffId, String(owner._id));
    const end = new Date(start.getTime() + 30 * 60000);
    assert.equal((await request(`/businesses/${businessId}`, owner.firebaseUid, 'PATCH', { isVisible: false })).status, 200);
    const manual = await request(`/dashboard/${businessId}/walk-in`, owner.firebaseUid, 'POST', {
      fullName: 'Test Customer', phoneNumber: '+251911000999', userLat: 8.98, userLng: 38.75,
      serviceIds: [serviceId], paymentMethod: 'cash', startTime: start.toISOString(), endTime: end.toISOString(),
      staffPlan: [{ staffId: String(owner._id), serviceId, startTime: start.toISOString(), endTime: end.toISOString() }],
    });
    assert.equal(manual.status, 201, JSON.stringify(manual.data));
    const bookingId = String(manual.data._id);
    const detail = await request(`/independent/bookings/${bookingId}`, owner.firebaseUid);
    assert.equal(detail.status, 200);
    assert.equal(String(detail.data._id), bookingId);
    assert.equal(detail.data.clientId.fullName, 'Test Customer');
    assert.ok(Array.isArray(detail.data.serviceIds));
    assert.equal((await request(`/independent/bookings/${bookingId}`)).status, 401);
    assert.equal((await request('/independent/bookings/not-an-id', owner.firebaseUid)).status, 400);
    assert.equal((await request(`/independent/bookings/${new mongoose.Types.ObjectId()}`, owner.firebaseUid)).status, 404);
    const otherOwner = await User.create({ firebaseUid: 'independent-notification-other', fullName: 'Other Barber', email: 'other-barber@example.test', roles: ['owner'] });
    assert.equal((await request('/independent/setup', otherOwner.firebaseUid, 'POST', { name: 'Other Independent', addressString: 'Other street', longitude: 38.75, latitude: 8.98 })).status, 201);
    assert.equal((await request(`/independent/bookings/${bookingId}`, otherOwner.firebaseUid)).status, 404);

    assert.equal((await request('/independent/absences', owner.firebaseUid, 'POST', { startTime: start.toISOString(), endTime: end.toISOString(), reason: 'Conflict' })).status, 409);
    assert.equal((await request(`/independent/bookings/${bookingId}/cash-payment`, outsider.firebaseUid, 'POST', {})).status, 404);
    assert.equal((await request(`/independent/bookings/${bookingId}/cash-payment`, owner.firebaseUid, 'POST', {})).status, 200);
    assert.equal((await request(`/independent/bookings/${bookingId}/cash-payment`, owner.firebaseUid, 'POST', {})).status, 409);
    assert.equal((await request(`/independent/bookings/${bookingId}/status`, owner.firebaseUid, 'PATCH', { status: 'completed' })).status, 400);
    assert.equal((await request(`/services/${serviceId}`, owner.firebaseUid, 'PATCH', { isActive: false })).status, 200);
    assert.equal((await request(`/businesses/${businessId}/services`)).data.length, 0);
    // Existing independent accounts can retain their old login-ID schedule.
    await Availability.deleteMany({ staffId: String(owner._id) });
    await Availability.insertMany(schedule.map(row => ({ ...row, staffId: owner.firebaseUid })));
    await StaffProfile.deleteMany({ staffId: String(owner._id) });
    assert.equal((await request('/independent/schedule', owner.firebaseUid)).data.length, 2);
    assert.equal((await request('/independent/schedule', owner.firebaseUid, 'PUT', [])).status, 200);
    assert.equal((await request('/independent/schedule', owner.firebaseUid)).data.length, 0);
    console.log('Independent integration checks passed: ownership, setup, services, split shifts, customer availability, manual booking, payment idempotency, legacy hours and closed days.');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    assert.equal(mongoose.connection.name, database);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
