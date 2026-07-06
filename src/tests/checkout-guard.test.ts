import assert from "node:assert/strict";
import { test, mock } from "node:test";
import mongoose, { Types } from "mongoose";
import Booking from "../models/Booking";
import Business from "../models/Business";
import { checkoutBooking } from "../services/booking.service";

for (const scenario of [
  { paymentStatus: "paid", status: "confirmed", message: "already been paid" },
  { paymentStatus: "unpaid", status: "cancelled", message: "current status" },
  { paymentStatus: "unpaid", status: "no-show", message: "current status" },
]) {
  test(`checkout rejects ${scenario.paymentStatus}/${scenario.status} before changing stock or spending`, async () => {
    const ownerId = new Types.ObjectId();
    let ended = false;
    mock.method(mongoose, "startSession", async () => ({
      withTransaction: async (action: () => Promise<unknown>) => action(),
      endSession: async () => { ended = true; },
    }));
    const query = {
      populate: () => query,
      session: async () => ({ businessId: new Types.ObjectId(), ...scenario }),
    };
    mock.method(Booking, "findById", () => query);
    mock.method(Business, "findById", () => ({ session: async () => ({ ownerId }) }));
    try {
      await assert.rejects(checkoutBooking({ bookingId: "test", ownerId, products: [], paymentMethod: "cash" }),
        (error: Error & { statusCode?: number }) => error.statusCode === 409 && error.message.includes(scenario.message));
      assert.equal(ended, true);
    } finally {
      mock.restoreAll();
    }
  });
}
