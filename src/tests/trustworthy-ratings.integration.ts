/**
 * Trustworthy ratings: paid-visit gate, average from visible reviews, zero when empty.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose, { Types } from "mongoose";
import app from "../app";
import env from "../config/env";
import Booking from "../models/Booking";
import Business from "../models/Business";
import Review from "../models/Review";
import User from "../models/User";
import { recalculateBusinessRating } from "../services/review.service";

async function main() {
  process.env.NODE_ENV = "development";
  const database = `ratings_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  await mongoose.connect(env.MONGO_URI, { dbName: database });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const request = async (
    path: string,
    user?: string,
    method = "GET",
    body?: unknown,
  ) => {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(user ? { "x-dev-user-id": user } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    const payload = response.status === 204 ? null : await response.json();
    return {
      status: response.status,
      data: payload?.status === "success" ? payload.data : payload,
      message: payload?.message as string | undefined,
    };
  };

  try {
    await Promise.all([User.init(), Business.init(), Review.init(), Booking.init()]);

    const owner = await User.create({
      firebaseUid: "ratings-owner",
      fullName: "Ratings Owner",
      email: "ratings-owner@example.test",
      roles: ["owner"],
    });
    const visitor = await User.create({
      firebaseUid: "ratings-visitor",
      fullName: "Ratings Visitor",
      email: "ratings-visitor@example.test",
      communityGuidelinesAcceptedAt: new Date(),
    });
    const other = await User.create({
      firebaseUid: "ratings-other",
      fullName: "Ratings Other",
      email: "ratings-other@example.test",
      communityGuidelinesAcceptedAt: new Date(),
    });

    const shop = await Business.create({
      name: "Ratings Shop",
      ownerId: owner._id,
      type: "shop",
      isVisible: true,
      verificationStatus: "active",
      rating: 4.8,
      location: { type: "Point", coordinates: [38.75, 9.03] },
      homeLocation: { type: "Point", coordinates: [38.75, 9.03] },
    });
    const shopId = String(shop._id);
    const visitorId = String(visitor._id);
    const otherId = String(other._id);

    // Stale seeded score with no reviews must become 0.
    assert.equal(await recalculateBusinessRating(shopId), 0);
    assert.equal((await Business.findById(shopId))!.rating, 0);

    // No paid visit → reject review.
    const blocked = await request(`/reviews`, visitorId, "POST", {
      businessId: shopId,
      rating: 5,
      comment: "Great cut",
    });
    assert.equal(blocked.status, 403);

    const endTime = new Date(Date.now() - 60 * 60 * 1000);
    const startTime = new Date(endTime.getTime() - 45 * 60 * 1000);
    await Booking.create({
      userId: visitorId,
      businessId: shop._id,
      staffId: String(owner._id),
      serviceIds: [new Types.ObjectId()],
      startTime,
      endTime,
      totalAmount: 200,
      status: "confirmed",
      paymentStatus: "paid",
      paidAt: startTime,
      completedAt: endTime,
    });

    for (const invalid of [
      { status: "pending", paymentStatus: "paid", endTime },
      { status: "cancelled", paymentStatus: "paid", endTime },
      { status: "confirmed", paymentStatus: "unpaid", endTime },
      { status: "confirmed", paymentStatus: "paid", endTime: new Date(Date.now() + 3600000) },
    ]) {
      await Booking.updateOne({ userId: visitorId }, { $set: invalid });
      assert.equal((await request(`/reviews`, visitorId, "POST", {
        businessId: shopId, rating: 5, comment: "Not eligible",
      })).status, 403);
    }
    await Booking.updateOne({ userId: visitorId }, { $set: { status: "confirmed", paymentStatus: "paid", endTime } });

    const created = await request(`/reviews`, visitorId, "POST", {
      businessId: shopId,
      rating: 5,
      comment: "Great cut after visit",
    });
    assert.equal(created.status, 201);
    assert.equal((await Business.findById(shopId))!.rating, 5);

    await Booking.create({
      userId: otherId,
      businessId: shop._id,
      staffId: String(owner._id),
      serviceIds: [new Types.ObjectId()],
      startTime,
      endTime,
      totalAmount: 200,
      status: "confirmed",
      paymentStatus: "paid",
      paidAt: startTime,
      completedAt: endTime,
    });
    const second = await request(`/reviews`, otherId, "POST", {
      businessId: shopId,
      rating: 3,
      comment: "Okay visit",
    });
    assert.equal(second.status, 201);
    assert.equal((await Business.findById(shopId))!.rating, 4);

    // Hidden reviews must not inflate the average.
    await Review.updateOne(
      { userId: other._id, businessId: shop._id },
      { $set: { isHidden: true } },
    );
    assert.equal(await recalculateBusinessRating(shopId), 5);

    console.log("✅ trustworthy-ratings.integration passed");
  } finally {
    assert.equal(mongoose.connection.name, database);
    assert.match(database, /^ratings_test_[a-f0-9]{16}$/);
    await mongoose.connection.dropDatabase();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("❌ trustworthy-ratings.integration failed:", error);
  process.exitCode = 1;
});
