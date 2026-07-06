import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose, { Types } from "mongoose";
import app from "../app";
import env from "../config/env";
import User from "../models/User";
import Business from "../models/Business";
import Booking from "../models/Booking";
import Client from "../models/Client";
import Review from "../models/Review";
import Product from "../models/Product";
import ProductReview from "../models/ProductReview";
import DeviceToken from "../models/DeviceToken";
import Message from "../models/Message";
import AccountDeletion from "../models/AccountDeletion";
import ContentReport from "../models/ContentReport";
import { sendPushToUser } from "../services/notification.service";
import { processAccountDeletion } from "../services/account-deletion.service";
import { emitChatMessage } from "../services/chat.service";
import { presentBusiness } from "../services/businessPresentation.service";
import { deleteLocalFile } from "../services/media.service";
import { syncUserFromFirebase } from "../services/auth.service";

async function main() {
  process.env.NODE_ENV = "development";
  const database = `privacy_safety_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  await mongoose.connect(env.MONGO_URI, { dbName: database });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const request = async (path: string, user?: string, method = "GET", body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1${path}`, {
      method, headers: { "Content-Type": "application/json", ...(user ? { "x-dev-user-id": user } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = response.status === 204 ? null : await response.json();
    return { status: response.status, data: payload?.status === 'success' ? payload.data : payload };
  };
  const awaitDeletion = async (response: { status: number; data: any }) => {
    assert.ok([200, 202].includes(response.status));
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const job = await AccountDeletion.findById(response.data.requestId);
      if (job?.status === 'complete') return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.fail('Deletion did not complete within the test deadline');
  };
  try {
    await Promise.all([User.init(), ContentReport.init(), AccountDeletion.init()]);
    const customer = await User.create({ firebaseUid: "qa-customer", fullName: "QA Customer", email: "qa-customer@example.test", phoneNumber: "+251911123456" });
    const author = await User.create({ firebaseUid: "qa-author", fullName: "QA Author", email: "qa-author@example.test" });
    const owner = await User.create({ firebaseUid: "qa-owner", fullName: "QA Owner", email: "qa-owner@example.test", roles: ["owner"] });
    const moderator = await User.create({ firebaseUid: "qa-admin", fullName: "QA Admin", email: "qa-admin@example.test", roles: ["admin"] });
    const cid = String(customer._id), aid = String(author._id), oid = String(owner._id), mid = String(moderator._id);
    const business = await Business.create({ name: "QA Shop", ownerId: owner._id, type: "shop", isVisible: true, verificationStatus: "active", productsEnabled: true, location: { type: "Point", coordinates: [38, 9] }, homeLocation: { type: "Point", coordinates: [38, 9] } });
    const review = await Review.create({ businessId: business._id, userId: author._id, rating: 5, comment: "Helpful staff" });
    const product = await Product.create({ businessId: business._id, name: "QA Product", price: 100 });
    const productReview = await ProductReview.create({ productId: product._id, businessId: business._id, userId: author._id, rating: 5, comment: "Useful" });
    assert.equal((await request('/users/me/notification-preferences')).status, 401);
    assert.equal((await request('/users/me/notification-preferences', cid)).data.marketing, false);
    assert.equal((await request('/users/me/notification-preferences', cid, 'PATCH', { bookingUpdates: false })).data.bookingUpdates, false);
    assert.equal((await request('/users/me/notification-preferences', cid, 'PATCH', { marketing: 'yes' })).status, 400);
    assert.equal((await request('/users/me/notification-preferences', cid)).data.bookingUpdates, false);
    await DeviceToken.create({ userId: customer._id, fcmToken: 'qa-token' });
    assert.equal((await sendPushToUser(cid, { notification: { title: 'QA', body: 'QA' }, data: { type: 'booking_confirmation' } })).successCount, 0);
    assert.equal((await sendPushToUser(cid, { notification: { title: 'QA', body: 'QA' } })).successCount, 0);
    assert.equal((await request('/admin/content-reports', cid)).status, 403);
    assert.equal((await request(`/products/${product._id}/reviews`, cid, 'POST', { rating: 4, comment: 'Before consent' })).status, 403);
    assert.equal((await request('/users/me/community-guidelines', cid, 'POST', { accepted: true })).status, 204);
    assert.equal((await request(`/products/${product._id}/reviews`, cid, 'POST', { rating: 4, comment: 'No purchase' })).status, 403);
    await Booking.create({
      userId: cid,
      businessId: business._id,
      staffId: aid,
      serviceIds: [new Types.ObjectId()],
      totalAmount: 100,
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      paidAt: new Date(),
      startTime: new Date(Date.now() - 7200000),
      endTime: new Date(Date.now() - 3600000),
      checkoutItems: [{ productId: product._id, quantity: 1, unitPrice: 100, name: 'QA Product' }],
    });
    assert.equal((await request(`/products/${product._id}/reviews`, cid, 'POST', { rating: 4, comment: 'Genuine review' })).status, 201);
    assert.equal((await request(`/products/${product._id}/reviews`, cid, 'POST', { rating: 4, comment: 'kill yourself' })).status, 400);
    await ProductReview.deleteMany({ userId: customer._id });
    assert.equal((await request('/users/me/blocked-users', cid, 'POST', { userId: aid })).status, 204);
    assert.equal((await request(`/businesses/${business._id}/reviews`, cid)).data.length, 0);
    assert.equal((await request(`/products/${product._id}/reviews`, cid)).data.length, 0);
    assert.equal((await request(`/businesses/${business._id}/reviews`)).data.length, 1);
    await request(`/users/me/blocked-users/${aid}`, cid, 'DELETE');
    const input = { targetType: 'review', targetId: String(review._id), reason: 'misleading' };
    const reported = await request('/content-reports', cid, 'POST', input);
    assert.equal(reported.status, 201);
    await request('/content-reports', cid, 'POST', input);
    assert.equal(await ContentReport.countDocuments(), 1);
    assert.equal((await request(`/admin/content-reports/${reported.data._id}`, mid, 'PATCH', { action: 'remove' })).status, 200);
    assert.equal((await request(`/businesses/${business._id}/reviews`)).data.length, 0);
    assert.equal((await Business.findById(business._id))!.rating, 0);
    const pr = await request('/content-reports', cid, 'POST', { ...input, targetType: 'product_review', targetId: String(productReview._id) });
    await request(`/admin/content-reports/${pr.data._id}`, mid, 'PATCH', { action: 'remove' });
    assert.equal((await Product.findById(product._id))!.ratingCount, 0);
    const client = await Client.create({ businessId: business._id, fullName: customer.fullName, phoneNumber: customer.phoneNumber, email: customer.email, notes: 'Private' });
    const bookingFields = { businessId: business._id, staffId: aid, serviceIds: [new Types.ObjectId()], startTime: new Date(), endTime: new Date(Date.now() + 3600000), totalAmount: 100 };
    const paid = await Booking.create({ ...bookingFields, userId: cid, clientId: client._id, paymentStatus: 'paid', appointmentNotes: 'Private', cancelledBy: cid });
    const unpaid = await Booking.create({ ...bookingFields, userId: cid });
    const unrelated = await Booking.create({ ...bookingFields, userId: aid });
    await Message.create({ bookingId: paid._id, senderId: cid, text: 'My private message' });
    await Review.create({ businessId: business._id, userId: customer._id, rating: 4, comment: 'Mine' });
    await request('/users/me/blocked-users', oid, 'POST', { userId: cid });
    await assert.rejects(() => emitChatMessage({ bookingId: String(paid._id), senderId: cid, text: 'Blocked' }));
    assert.equal((await request('/users/me', cid, 'DELETE', { confirmation: 'wrong' })).status, 400);
    const deleted = await request('/users/me', cid, 'DELETE', { confirmation: 'DELETE' });
    await awaitDeletion(deleted);
    assert.equal(await User.exists({ _id: customer._id }), null);
    await assert.rejects(() => syncUserFromFirebase({ firebaseUid: 'qa-customer' }));
    assert.equal(await User.exists({ firebaseUid: 'qa-customer' }), null);
    assert.equal(await Booking.exists({ _id: unpaid._id }), null);
    assert.ok(await Booking.exists({ _id: unrelated._id }));
    const retained = await Booking.findById(paid._id);
    assert.equal(retained!.userId, 'deleted'); assert.ok(retained!.retainedUntil);
    assert.equal(retained!.clientId, undefined); assert.equal(retained!.appointmentNotes, undefined); assert.equal(retained!.cancelledBy, undefined);
    assert.equal(await DeviceToken.countDocuments({ userId: customer._id }), 0);
    assert.equal(await Message.countDocuments({ senderId: cid }), 0);
    assert.equal(await Review.countDocuments({ userId: customer._id }), 0);
    assert.equal((await Client.findById(client._id))!.email, undefined);
    assert.equal((await User.findById(owner._id))!.blockedUsers.length, 0);
    assert.equal((await request('/users/me/notification-preferences', cid)).status, 401);
    const pendingUser = await User.create({ firebaseUid: 'unconfigured-external-user', fullName: 'Pending', email: 'pending@example.test' });
    const pending = await request('/users/me', String(pendingUser._id), 'DELETE', { confirmation: 'DELETE' });
    assert.equal(pending.status, 202); assert.equal(pending.data.status, 'pending');
    assert.ok((await User.findById(pendingUser._id))!.deletionPendingAt);
    assert.equal((await request('/users/me/notification-preferences', String(pendingUser._id))).status, 403);
    assert.equal(await processAccountDeletion(pending.data.requestId), false);
    assert.equal((await request('/account-deletion-requests', undefined, 'POST', { contact: 'pending@example.test' })).status, 202);
    assert.equal((await request('/account-deletion-requests', undefined, 'POST', { contact: 'pending@example.test' })).status, 202);
    assert.equal(await AccountDeletion.countDocuments({ contact: 'pending@example.test' }), 1);
    const retry = await AccountDeletion.findById(pending.data.requestId);
    assert.equal(retry!.lastFailureStage, 'authentication');
    assert.ok(retry!.nextAttemptAt && retry!.nextAttemptAt > new Date());
    const externalRequest = await AccountDeletion.findOne({ contact: 'pending@example.test' });
    assert.equal((await request(`/admin/account-deletion-requests/${externalRequest!._id}/verify`, mid, 'POST', { userId: aid, ownershipVerified: true })).status, 400);
    assert.equal((await request(`/admin/account-deletion-requests/${externalRequest!._id}/verify`, mid, 'POST', { userId: 'invalid', ownershipVerified: true })).status, 400);
    await Business.updateOne({ _id: business._id }, { idCardUrl: '/uploads/id-cards/qa.webp', idNumber: 'Private' });
    assert.equal((await request(`/businesses/${business._id}`)).data.idCardUrl, undefined);
    assert.equal((await request(`/businesses/${business._id}`, oid)).data.idNumber, 'Private');
    await Business.updateOne({ _id: business._id }, { $unset: { idCardUrl: 1 } });
    const ownerDeletion = await request('/users/me', oid, 'DELETE', { confirmation: 'DELETE' });
    await awaitDeletion(ownerDeletion);
    assert.equal((await Business.findById(business._id))!.isVisible, false);
    assert.equal((await request(`/businesses/${business._id}`)).status, 404);
    assert.ok(await User.exists({ _id: author._id }));
    assert.ok(await Booking.exists({ _id: unrelated._id }));
    const presented = presentBusiness({ name: 'Private QA', idCardUrl: '/uploads/id-cards/qa.webp', idNumber: 'Private', homeLocation: { coordinates: [1, 2] } });
    assert.equal(presented.idCardUrl, undefined); assert.equal(presented.homeLocation, undefined);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/uploads/id-cards/qa.webp`)).status, 401);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/uploads/%69d-cards/qa.webp`)).status, 403);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/uploads/booking%2Dscreenshots/${paid._id}/qa.webp`)).status, 403);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/uploads/booking-screenshots/${paid._id}/qa.webp`)).status, 401);
    await assert.rejects(() => deleteLocalFile('/uploads/../../outside-file.webp'));
    console.log('PASS: preferences, opt-in delivery, blocking, report deduplication, moderation, deletion isolation, durable retries, private documents and path confinement');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    assert.equal(mongoose.connection.name, database);
    assert.ok(database.startsWith('privacy_safety_test_'));
    try { await mongoose.connection.dropDatabase(); }
    finally { await mongoose.disconnect(); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
