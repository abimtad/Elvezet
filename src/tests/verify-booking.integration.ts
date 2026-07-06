import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import env from "../config/env";
import app from "../app";
import User from "../models/User";
import Business from "../models/Business";
import Booking from "../models/Booking";
import SmsSubscription from "../models/SmsSubscription";
import StaffProfile from "../models/StaffProfile";
import { applyVerifyEtResultToBooking } from "../services/bookingPaymentVerify.service";
import { normalizeVerification } from "../services/verifyEt.service";

async function main() {
  process.env.NODE_ENV = "development";
  const database = `verify_booking_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  await mongoose.connect(env.MONGO_URI, { dbName: database });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    for (const path of ["/bookings/availability/check", "/bookings/availability/range"]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      assert.equal(response.status, 400, "Public availability reaches validation without requiring sign-in");
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/v1/bookings/000000000000000000000001/messages`)).status, 401, "Chat still requires sign-in");
    await Booking.init();
    const owner = await User.create({ firebaseUid: "verify-owner", fullName: "Owner", email: "owner@example.test", roles: ["owner"] });
    const customer = await User.create({ firebaseUid: "verify-customer", fullName: "Customer", email: "customer@example.test" });
    const admin = await User.create({ firebaseUid: "verify-admin", fullName: "Admin", email: "admin@example.test", roles: ["admin"] });
    const business = await Business.create({ name: "Verify Test", ownerId: owner._id, type: "shop", location: { type: "Point", coordinates: [38, 9] }, homeLocation: { type: "Point", coordinates: [38, 9] }, settlementAccount: "1000123456789" });
    const make = (status = "pending") => Booking.create({ userId: String(customer._id), businessId: business._id, staffId: "verify-staff", serviceIds: [], staffPlan: [], totalAmount: 1500, startTime: new Date(Date.now() + 3600000), endTime: new Date(Date.now() + 5400000), status, paymentMethod: "telebirr" });
    const request = (path: string, uid: string, method = "GET", body?: unknown) => fetch(`http://127.0.0.1:${port}/api/v1${path}`, { method, headers: { "x-dev-user-id": uid, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const booking = await make();
    const statusPath = `/dashboard/${business._id}/bookings/${booking._id}/status`;
    assert.equal((await request(statusPath, owner.firebaseUid, "PATCH", { status: "confirmed" })).status, 409);
    assert.equal((await request(statusPath, owner.firebaseUid, "PATCH", { status: "cancelled" })).status, 200);
    assert.equal((await request(statusPath, owner.firebaseUid, "PATCH", { status: "confirmed" })).status, 409, "Cancellation cannot bypass required payment");
    assert.equal((await request(statusPath, owner.firebaseUid, "PATCH", { status: "pending" })).status, 409, "Terminal bookings cannot be reopened through status PATCH");
    await Booking.updateOne({ _id: booking._id }, { status: "pending" });
    const staff = await User.create({ firebaseUid: "verify-staff-firebase", fullName: "Staff", email: "staff@example.test", roles: ["staff"] });
    const membership = await StaffProfile.create({ staffId: staff.firebaseUid, businessId: business._id });
    await Booking.updateOne({ _id: booking._id }, { staffId: String(staff._id) });
    const receiptPath = `/uploads/booking-screenshots/${booking._id}/missing.png`;
    const receipt = () => fetch(`http://127.0.0.1:${port}${receiptPath}`, { headers: { "x-dev-user-id": staff.firebaseUid } });
    assert.equal((await request(`/bookings/${booking._id}/messages`, staff.firebaseUid)).status, 200, "Firebase UID membership grants chat access");
    assert.equal((await receipt()).status, 404, "Authorized staff reach file lookup");
    await StaffProfile.updateOne({ _id: membership._id }, { isActive: false });
    assert.equal((await request(`/bookings/${booking._id}/messages`, staff.firebaseUid)).status, 403, "Assignment does not preserve revoked chat access");
    assert.equal((await receipt()).status, 403, "Assignment does not preserve revoked receipt access");
    await StaffProfile.updateOne({ _id: membership._id }, { staffId: String(staff._id), isActive: true });
    assert.equal((await request(`/bookings/${booking._id}/messages`, staff.firebaseUid)).status, 200, "Database ID membership grants chat access");
    assert.equal((await receipt()).status, 404);
    assert.equal((await request(`/bookings/${booking._id}/messages`, customer.firebaseUid, "POST", { text: "Is this time available?" })).status, 201);
    assert.equal((await request(`/bookings/${booking._id}/messages`, owner.firebaseUid, "POST", { text: "Yes, please upload your receipt." })).status, 201);
    assert.equal((await request(`/bookings/${booking._id}/messages`, admin.firebaseUid)).status, 403);
    const history = (await (await request(`/bookings/${booking._id}/messages`, customer.firebaseUid)).json()).data;
    assert.equal(history.filter((message: { senderType?: string }) => message.senderType !== "assistant").length, 2);
    assert.equal(history.filter((message: { senderType?: string }) => message.senderType === "assistant").length, 1);
    await applyVerifyEtResultToBooking(String(booking._id), { processingStatus: "queued", verified: false });
    assert.equal((await Booking.findById(booking._id))!.paymentVerificationStatus, "queued");
    const result = normalizeVerification({ success: true, data: [{ bank: "cbe", status: "success", verified: true, amount: 1500, currency: "ETB", receiptNumber: "receipt-1", settlementAccountMatch: { matched: true } }], verification: { processingStatus: "completed" } });
    assert.equal(result.amount, 1500);
    await applyVerifyEtResultToBooking(String(booking._id), { ...result, amount: 1 });
    assert.equal((await Booking.findById(booking._id))!.paymentStatus, "unpaid");
    await applyVerifyEtResultToBooking(String(booking._id), { ...result, settlementAccountMatch: undefined });
    assert.equal((await Booking.findById(booking._id))!.paymentStatus, "unpaid");
    await applyVerifyEtResultToBooking(String(booking._id), result);
    assert.equal((await Booking.findById(booking._id))!.status, "confirmed");
    const duplicate = await make();
    await applyVerifyEtResultToBooking(String(duplicate._id), result);
    assert.equal((await Booking.findById(duplicate._id))!.paymentStatus, "unpaid");
    const expired = await make("expired");
    await applyVerifyEtResultToBooking(String(expired._id), { ...result, amount: 1, receiptNumber: "receipt-2" });
    assert.equal((await Booking.findById(expired._id))!.paymentVerificationStatus, "mismatch");
    await applyVerifyEtResultToBooking(String(expired._id), { ...result, settlementAccountMatch: { matched: false }, receiptNumber: "receipt-2" });
    assert.equal((await Booking.findById(expired._id))!.paymentVerificationStatus, "mismatch");
    await applyVerifyEtResultToBooking(String(expired._id), result);
    assert.equal((await Booking.findById(expired._id))!.paymentVerificationStatus, "mismatch", "Late receipts cannot reuse a paid transaction");
    await Promise.all([1, 2].map(() => applyVerifyEtResultToBooking(String(expired._id), { ...result, receiptNumber: "receipt-2" })));
    assert.equal((await Booking.findById(expired._id))!.status, "expired");
    assert.equal(
      (await Booking.findById(expired._id))!.paymentVerificationStatus,
      "manual_review",
      "Late verified payments on expired bookings need manual review",
    );
    const reviewed = (await Booking.findById(expired._id))!;
    assert.equal(reviewed.verifiedTransactionKey, "cbe:receipt-2");
    assert.equal(reviewed.notificationEvents!.filter(event => event === "payment_verification_manual_review").length, 1);
    const reuseLate = await make();
    await applyVerifyEtResultToBooking(String(reuseLate._id), { ...result, receiptNumber: "receipt-2" });
    assert.equal((await Booking.findById(reuseLate._id))!.paymentStatus, "unpaid", "Review payments reserve their transaction reference");
    assert.equal((await request(`/sms/${business._id}/request`, owner.firebaseUid, "POST", {})).status, 202);
    assert.equal((await SmsSubscription.findOne({ businessId: business._id }))!.adminEnabled, false);
    assert.equal((await request(`/sms/${business._id}/admin`, owner.firebaseUid, "PUT", { status: "active", monthlyQuota: 500 })).status, 403);
    assert.equal((await request(`/sms/${business._id}/admin`, admin.firebaseUid, "PUT", { status: "active", monthlyQuota: 500 })).status, 200);
    assert.equal((await SmsSubscription.findOne({ businessId: business._id }))!.adminEnabled, true);
    console.log("PASS: receipt amount/recipient/reuse, pending/expired states, scoped chat and admin SMS approval");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    try { if (mongoose.connection.name === database && database.startsWith("verify_booking_test_")) await mongoose.connection.dropDatabase(); }
    finally { await mongoose.disconnect(); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
