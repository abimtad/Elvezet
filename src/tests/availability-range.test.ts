import assert from "node:assert/strict";
import { test, mock } from "node:test";
import Business from "../models/Business";
import Service from "../models/Service";
import StaffProfile from "../models/StaffProfile";
import Availability from "../models/Availability";
import Booking from "../models/Booking";
import Absence from "../models/Absence";
import User from "../models/User";
import { getAvailableSlots, getAvailableSlotsRange } from "../services/availability.service";

test('range shares six reads and matches single days with bookings and absences', async () => {
  const reads = { business: 0, services: 0, staff: 0, availability: 0, bookings: 0, absences: 0 };
  const at = (day: number, hour: number, minute = 0) => new Date(2030, 0, day, hour, minute);
  const query = (value: unknown) => {
    const result = { select: () => result, lean: async () => value };
    return result;
  };
  mock.method(Business, 'findById', () => { reads.business++; return query({ openingTime: '09:00', closingTime: '18:00', type: 'shop' }); });
  mock.method(Service, 'find', () => { reads.services++; return query([{ _id: 'service', duration: 30, category: 'hair' }]); });
  mock.method(StaffProfile, 'find', () => { reads.staff++; return query([{ staffId: 'staff', services: ['service'] }]); });
  mock.method(Availability, 'find', () => { reads.availability++; return query(Array.from({ length: 7 }, (_, dayOfWeek) => ({ staffId: 'staff', dayOfWeek, startTime: '09:00', endTime: '18:00' }))); });
  mock.method(Booking, 'find', () => {
    reads.bookings++;
    return query([
      { staffId: 'staff', startTime: at(7, 9), endTime: at(7, 10), staffPlan: [] },
      { staffId: 'other', startTime: at(8, 23), endTime: at(9, 10), staffPlan: [{ staffId: 'staff' }] },
    ]);
  });
  mock.method(Absence, 'find', () => { reads.absences++; return query([{ staffId: 'staff', startTime: at(10, 9), endTime: at(10, 12) }]); });
  try {
    const input = { shopId: 'shop', date: '2030-01-07', serviceIds: ['service'], professionalId: 'staff' };
    const range = await getAvailableSlotsRange({ ...input, days: 7 });
    assert.deepEqual(Object.values(reads), [1, 1, 1, 1, 1, 1]);
    for (const day of range.days) {
      const single = await getAvailableSlots({ ...input, date: day.date, skipNextAvailable: true });
      assert.deepEqual(day.availableSlots, single.availableSlots, day.date);
    }
    assert.equal(new Date(range.days[0].availableSlots[0].startTime).getHours(), 10);
    assert.equal(new Date(range.days[0].availableSlots[0].startTime).getMinutes(), 15);
    assert.equal(new Date(range.days[3].availableSlots[0].startTime).getHours(), 12);
  } finally {
    mock.restoreAll();
  }
});

test('range rejects unbounded requests before touching the database', async () => {
  await assert.rejects(getAvailableSlotsRange({ shopId: 'shop', date: '2030-01-07', serviceIds: ['service'], days: 30 }), /1 to 7 days/);
});

test('independent owner slots honor split shifts, configured buffer and closed days', async () => {
  const query = (value: unknown) => { const result = { select: () => result, lean: async () => value }; return result; };
  mock.method(User, 'findById', () => query({ firebaseUid: 'legacy-owner' }));
  mock.method(Business, 'findById', () => query({ type: 'independent', ownerId: 'owner', openingTime: '09:00', closingTime: '18:00', bookingBufferMinutes: 30 }));
  mock.method(Service, 'find', () => query([{ _id: 'service', duration: 30 }]));
  mock.method(StaffProfile, 'find', () => query([{ staffId: 'owner', services: ['service'] }]));
  let working = true;
  mock.method(Availability, 'find', () => query(working ? [
    { staffId: 'owner', dayOfWeek: 1, startTime: '09:00', endTime: '12:00' },
    { staffId: 'owner', dayOfWeek: 1, startTime: '13:00', endTime: '18:00' },
  ] : []));
  mock.method(Booking, 'find', () => query([{ staffId: 'owner', startTime: new Date(2030, 0, 7, 13), endTime: new Date(2030, 0, 7, 14), staffPlan: [] }]));
  mock.method(Absence, 'find', () => query([]));
  try {
    const input = { shopId: 'business', date: '2030-01-07', serviceIds: ['service'], skipNextAvailable: true };
    const result = await getAvailableSlots(input);
    assert.ok(result.availableSlots.length > 0);
    for (const slot of result.availableSlots) {
      const start = new Date(slot.startTime);
      const minute = start.getHours() * 60 + start.getMinutes();
      assert.ok(minute <= 11 * 60 + 30 || minute >= 14 * 60 + 30);
      assert.equal(slot.staffPlan[0].staffId, 'owner');
    }
    working = false;
    assert.equal((await getAvailableSlots(input)).availableSlots.length, 0);
  } finally { mock.restoreAll(); }
});
