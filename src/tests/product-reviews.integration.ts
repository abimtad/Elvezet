/**
 * Product reviews: paid checkoutItems gate, seller block, upsert, owner list, sort.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose, { Types } from "mongoose";
import app from "../app";
import env from "../config/env";
import Booking from "../models/Booking";
import Business from "../models/Business";
import Product from "../models/Product";
import ProductReview from "../models/ProductReview";
import User from "../models/User";

async function main() {
  process.env.NODE_ENV = "development";
  const database = `product_reviews_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  await mongoose.connect(env.MONGO_URI, {
    dbName: database,
    serverSelectionTimeoutMS: 10000,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const request = async (
    path: string,
    user?: string,
    method = "GET",
    body?: unknown,
  ) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(user ? { "x-dev-user-id": user } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = response.status === 204 ? null : await response.json();
    return {
      status: response.status,
      data: payload?.status === "success" ? payload.data : payload,
    };
  };

  try {
    await Promise.all([User.init(), ProductReview.init(), Booking.init()]);
    const buyer = await User.create({
      firebaseUid: "pr-buyer",
      fullName: "Buyer",
      email: "buyer@pr.test",
      roles: ["customer"],
    });
    const other = await User.create({
      firebaseUid: "pr-other",
      fullName: "Other",
      email: "other@pr.test",
      roles: ["customer"],
    });
    const owner = await User.create({
      firebaseUid: "pr-owner",
      fullName: "Owner",
      email: "owner@pr.test",
      roles: ["owner"],
    });
    const cid = String(buyer._id);
    const oid = String(owner._id);
    const xid = String(other._id);
    const business = await Business.create({
      name: "PR Shop",
      ownerId: owner._id,
      type: "shop",
      isVisible: true,
      verificationStatus: "active",
      productsEnabled: true,
      location: { type: "Point", coordinates: [38, 9] },
      homeLocation: { type: "Point", coordinates: [38, 9] },
    });
    const product = await Product.create({
      businessId: business._id,
      name: "Serum",
      price: 250,
      isActive: true,
    });
    for (const id of [cid, xid, oid]) {
      assert.equal(
        (await request("/users/me/community-guidelines", id, "POST", { accepted: true }))
          .status,
        204,
      );
    }

    const path = `/products/${product._id}/reviews`;
    assert.equal(
      (await request(path, cid, "POST", { rating: 5, comment: "Nope" })).status,
      403,
      "non-purchaser blocked",
    );

    const booking = await Booking.create({
      userId: cid,
      businessId: business._id,
      staffId: oid,
      serviceIds: [new Types.ObjectId()],
      totalAmount: 250,
      status: "confirmed",
      paymentStatus: "unpaid",
      paymentMethod: "cash",
      startTime: new Date(Date.now() - 7200000),
      endTime: new Date(Date.now() - 3600000),
      checkoutItems: [
        { productId: product._id, quantity: 1, unitPrice: 250, name: "Serum" },
      ],
    });
    assert.equal(
      (await request(path, cid, "POST", { rating: 4, comment: "Unpaid" })).status,
      403,
      "unpaid blocked",
    );

    await Booking.updateOne(
      { _id: booking._id },
      { $set: { paymentStatus: "paid", paidAt: new Date(), status: "cancelled" } },
    );
    assert.equal(
      (await request(path, cid, "POST", { rating: 4, comment: "Cancelled" })).status,
      403,
      "cancelled blocked",
    );

    await Booking.updateOne(
      { _id: booking._id },
      { $set: { status: "confirmed", paymentStatus: "paid", paidAt: new Date() } },
    );

    assert.equal(
      (await request(path, oid, "POST", { rating: 5, comment: "Own" })).status,
      403,
      "seller blocked",
    );

    const created = await request(path, cid, "POST", {
      rating: 5,
      comment: "Great",
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.verifiedPurchase, true);
    assert.equal(await ProductReview.countDocuments({ productId: product._id }), 1);

    const updated = await request(path, cid, "POST", {
      rating: 4,
      comment: "Updated",
    });
    assert.equal(updated.status, 201);
    assert.equal(await ProductReview.countDocuments({ productId: product._id }), 1);
    assert.equal(updated.data.rating, 4);
    assert.equal(updated.data.isHidden, false);

    assert.equal(
      (await request(path, xid, "POST", { rating: 1, comment: "Nope" })).status,
      403,
    );

    const mine = await request("/users/me/reviews", cid);
    assert.equal(mine.status, 200);
    assert.ok(
      (mine.data.reviews as any[]).some(
        (r) => r.kind === "product" && String(r.productId) === String(product._id),
      ),
    );
    assert.ok(
      !(mine.data.pending as any[]).some(
        (r) => r.kind === "product" && String(r.productId) === String(product._id),
      ),
      "reviewed product leaves pending",
    );

    const ownerList = await request(
      `/businesses/${business._id}/product-reviews`,
      oid,
    );
    assert.equal(ownerList.status, 200);
    assert.equal(ownerList.data.length, 1);
    assert.equal(ownerList.data[0].productName, "Serum");

    const reviewId = String(created.data._id || created.data.id);
    assert.equal(
      (await request(`/products/reviews/${reviewId}`, xid, "DELETE")).status,
      403,
    );
    assert.equal(
      (await request(`/products/reviews/${reviewId}`, cid, "DELETE")).status,
      200,
    );
    assert.equal(await ProductReview.countDocuments({ productId: product._id }), 0);

    // Sort: rating primary, date secondary
    await ProductReview.create({
      userId: other._id,
      productId: product._id,
      businessId: business._id,
      rating: 5,
      comment: "Old five",
      createdAt: new Date("2024-01-01"),
    } as any);
    await ProductReview.create({
      userId: buyer._id,
      productId: product._id,
      businessId: business._id,
      rating: 5,
      comment: "New five",
      createdAt: new Date("2025-06-01"),
    } as any);
    await ProductReview.create({
      userId: owner._id,
      productId: product._id,
      businessId: business._id,
      rating: 3,
      comment: "Three",
    });
    const listed = await request(`${path}?sort=best`);
    assert.equal(listed.status, 200);
    assert.equal(listed.data[0].rating, 5);
    assert.equal(listed.data[0].comment, "New five");
    assert.equal(listed.data[1].rating, 5);
    assert.equal(listed.data[1].comment, "Old five");
    assert.equal(listed.data[2].rating, 3);

    console.log("product-reviews.integration: ok");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
