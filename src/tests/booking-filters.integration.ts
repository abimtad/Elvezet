import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import env from '../config/env';
import app from '../app';
import User from '../models/User';
import Business from '../models/Business';
import Booking from '../models/Booking';

async function main() {
  process.env.NODE_ENV = 'development';
  await mongoose.connect(env.MONGO_URI, { dbName: `booking_filters_test_${randomUUID().replaceAll('-', '').slice(0, 16)}` });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const owner = await User.create({ firebaseUid: 'filters-owner', fullName: 'Owner', email: 'filters@example.test', roles: ['owner'] });
    const business = await Business.create({ ownerId: owner._id, name: 'Filters Test', type: 'shop', location: { type: 'Point', coordinates: [38, 9] }, homeLocation: { type: 'Point', coordinates: [38, 9] } });
    const other = await Business.create({ ownerId: new mongoose.Types.ObjectId(), name: 'Other', type: 'shop', location: { type: 'Point', coordinates: [38, 9] }, homeLocation: { type: 'Point', coordinates: [38, 9] } });
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(11, 0, 0, 0);
    const yesterday = new Date(tomorrow.getTime() - 2 * 86400000);
    const create = (status: string, start = tomorrow, extra: Record<string, unknown> = {}) => Booking.create({
      businessId: business._id, userId: String(owner._id), staffId: 'filter-staff',
      status, serviceIds: [], totalAmount: 100, startTime: start,
      endTime: new Date(start.getTime() + 3600000), ...extra,
    });
    const [confirmed, pending, completed, early, cancelled, expired, missed, legacyMissed] = await Promise.all([
      create('confirmed'), create('pending'), create('confirmed', yesterday),
      create('confirmed', tomorrow, { completedAt: new Date() }),
      create('cancelled'), create('expired', yesterday), create('no-show'), create('no_show'),
    ]);
    await create('pending', tomorrow, { businessId: other._id });
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/dashboard/${business._id}/bookings`;
    const get = async (query = '', authenticated = true) => {
      const response = await fetch(base + query, { headers: authenticated ? { 'x-dev-user-id': owner.firebaseUid } : {} });
      const body = await response.json(); return { status: response.status, data: body.data };
    };
    assert.equal((await get('', false)).status, 401);
    const expected: Record<string, string[]> = {
      confirmed: [String(confirmed._id)], pending: [String(pending._id)],
      completed: [String(completed._id), String(early._id)], cancelled: [String(cancelled._id)],
      expired: [String(expired._id)], 'no-show': [String(missed._id), String(legacyMissed._id)],
      no_show: [String(missed._id), String(legacyMissed._id)], upcoming: [String(confirmed._id)],
    };
    for (const [status, ids] of Object.entries(expected)) {
      const response = await get(`?status=${status}`);
      assert.equal(response.status, 200, status);
      assert.deepEqual(response.data.bookings.map((booking: any) => booking._id).sort(), ids.sort(), status);
      assert.equal(response.data.total, ids.length, status);
    }
    const all = await get(); assert.equal(all.data.total, 8, 'All includes cancelled and expired, but no other shop');
    const date = tomorrow.toISOString().slice(0, 10);
    const dated = await get(`?status=completed&date=${date}`);
    assert.deepEqual(dated.data.bookings.map((booking: any) => booking._id), [String(early._id)]);
    const first = await get('?limit=2&page=1'); const second = await get('?limit=2&page=2');
    assert.equal(first.data.totalPages, 4); assert.equal(second.data.page, 2);
    assert.equal(new Set([...first.data.bookings, ...second.data.bookings].map((booking: any) => booking._id)).size, 4);
    assert.equal((await get('?status=invalid')).status, 400);
    console.log('All booking tabs, aliases, completed appointments, date filtering, shop isolation and pagination passed.');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    try { await mongoose.connection.dropDatabase(); } finally { await mongoose.disconnect(); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
