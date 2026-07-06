import assert from "node:assert/strict";
import { test, mock } from "node:test";
import User from "../models/User";
import StaffProfile from "../models/StaffProfile";
import Business from "../models/Business";
import Booking from "../models/Booking";
import { getMyStats } from "../services/staff-self.service";

for (const independent of [false, true]) {
  test(`stats preserves ${independent ? "owner" : "staff"} earnings and visibility`, async () => {
    const leanQuery = (value: unknown) => ({ select: () => ({ lean: async () => value }) });
    mock.method(User, "findOne", () => leanQuery({ _id: 'owner', roles: independent ? ['owner'] : ['staff'] }));
    mock.method(StaffProfile, "findOne", () => leanQuery({ serviceCommission: { value: 25 } }));
    mock.method(Business, "exists", async () => ({ _id: 'shop' }));
    let scans = 0;
    mock.method(Booking, "aggregate", async (pipeline: any[]) => {
      scans++;
      assert.equal(pipeline[0].$match.staffId, 'staff-test');
      assert.equal(pipeline[0].$match.paymentStatus, 'paid');
      assert.equal(pipeline[0].$match.status, 'confirmed');
      assert.deepEqual(Object.keys(pipeline[1].$facet).sort(), ['dailyRevenue', 'serviceBreakdown', 'totals']);
      return [{ totals: [{ count: 2, revenue: 400, hours: 1.25 }], serviceBreakdown: [{ _id: 'Haircut', count: 2, totalRevenue: 400 }], dailyRevenue: [{ _id: '2026-10-05', count: 2, revenue: 400 }] }];
    });
    try {
      const stats = await getMyStats('staff-test', { period: 'week' });
      assert.equal(scans, 1);
      assert.equal(stats.completedBookings, 2);
      assert.equal(stats.hoursWorked, 1.3);
      assert.equal(stats.myEarnings, independent ? 400 : 100);
      assert.equal(stats.totalRevenue, independent ? 400 : 0);
      assert.equal(stats.canSeeFullRevenue, independent);
      assert.equal(stats.serviceBreakdown.length, 1);
      assert.equal(stats.dailyRevenue.length, 1);
    } finally {
      mock.restoreAll();
    }
  });
}

test('stats returns zeros for an empty period', async () => {
  mock.method(User, 'findOne', () => ({ select: () => ({ lean: async () => ({ roles: ['staff'] }) }) }));
  mock.method(StaffProfile, 'findOne', () => ({ select: () => ({ lean: async () => ({}) }) }));
  mock.method(Booking, 'aggregate', async () => [{ totals: [], serviceBreakdown: [], dailyRevenue: [] }]);
  try {
    const stats = await getMyStats('staff-test', { period: 'month' });
    assert.equal(stats.myEarnings, 0);
    assert.equal(stats.hoursWorked, 0);
    assert.equal(stats.completedBookings, 0);
  } finally {
    mock.restoreAll();
  }
});
