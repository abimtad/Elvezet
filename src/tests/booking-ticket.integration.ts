import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import env from "../config/env";
import app from "../app";
import User from "../models/User";
import Business from "../models/Business";
import Booking from "../models/Booking";
import BookingTicket from "../models/BookingTicket";
import StaffProfile from "../models/StaffProfile";
import Service from "../models/Service";
import { parseTicketCode } from "../services/booking-ticket.service";

async function main() {
  process.env.NODE_ENV = "development";
  // A fresh, task-owned database; no existing accounts or bookings are changed.
  const database = `ticket_test_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  await mongoose.connect(env.MONGO_URI, { dbName: database, serverSelectionTimeoutMS: 10000 });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as {port: number}).port;
  try {
    await BookingTicket.init();
    const makeUser = (name: string, roles: string[] = ["customer"]) => User.create({ firebaseUid: `ticket-${name}`, fullName: name, email: `${name}@example.test`, roles });
    const owner = await makeUser("owner", ["owner"]), customer = await makeUser("customer"), stranger = await makeUser("stranger"), staff = await makeUser("staff", ["staff"]), otherStaff = await makeUser("other-staff", ["staff"]);
    const business = await Business.create({ name: "Ticket salon", ownerId: owner._id, type: "shop", location: { type: "Point", coordinates: [38,9] }, homeLocation: { type: "Point", coordinates: [38,9] } });
    const service = await Service.create({ businessId: business._id, name: "Haircut", duration: 30, basePrice: 250 });
    const booking = await Booking.create({ userId: String(customer._id), businessId: business._id, staffId: staff.firebaseUid, serviceIds: [service._id], servicePriceSnapshots: [{serviceId: service._id, unitPrice: 200}], staffPlan: [], totalAmount: 200, startTime: new Date(Date.now()+3600000), endTime: new Date(Date.now()+5400000), status: "confirmed", paymentMethod: "cash", paymentStatus: "unpaid" });
    const membership = await StaffProfile.create({ businessId: business._id, staffId: String(staff._id), isActive: true });
    await StaffProfile.create({ businessId: business._id, staffId: otherStaff.firebaseUid, isActive: true });
    const request = async (path: string, uid?: string, method = "GET", body?: unknown, workspace?: string) => {
      const r = await fetch(`http://127.0.0.1:${port}/api/v1/bookings${path}`, { method, headers: { "Content-Type": "application/json", ...(uid ? {"x-dev-user-id":uid} : {}), ...(workspace ? {"x-business-id":workspace} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}) });
      return {status:r.status, body:await r.json() as any};
    };
    const path = `/${booking._id}/ticket`;
    assert.equal((await request(path)).status,401);
    assert.equal((await request(path,stranger.firebaseUid)).status,403);
    const issued = await Promise.all([request(path,customer.firebaseUid), request(path,customer.firebaseUid)]);
    assert.equal(issued[0].status,200); assert.equal(issued[1].status,200);
    const ticket = issued[0].body.data;
    assert.equal(ticket.qrPayload,issued[1].body.data.qrPayload,"Concurrent issuance returns one stable ticket");
    assert.match(ticket.qrPayload,/^elvezet:ticket:v1:[a-f0-9]{64}$/);
    assert.equal(parseTicketCode(ticket.qrPayload).token?.length,64);
    assert.equal(ticket.paymentStatus,"unpaid"); assert.equal(ticket.receiptReference,null);
    assert.equal(ticket.services[0].amount,200,"Ticket retains booked service price");
    const verify = (uid: string, code = ticket.qrPayload, workspace?: string) => request('/tickets/verify',uid,'POST',{code},workspace);
    assert.equal((await verify(customer.firebaseUid)).status,403,"Customer cannot verify through business endpoint");
    assert.equal((await verify(stranger.firebaseUid)).status,403);
    assert.equal((await verify(otherStaff.firebaseUid)).status,403,"Unassigned staff denied even with active membership");
    assert.equal((await verify(owner.firebaseUid,ticket.reference)).status,200,"Manual reference works");
    assert.equal((await verify(staff.firebaseUid)).status,200);
    assert.equal((await verify(owner.firebaseUid,ticket.reference,String(new mongoose.Types.ObjectId()))).status,403,"Cross-workspace verification denied");
    const unknown = await verify(owner.firebaseUid,`elvezet:ticket:v1:${'a'.repeat(64)}`);
    assert.equal(unknown.status,404);
    assert.equal((await verify(owner.firebaseUid,'https://evil.example')).status,400);
    assert.equal((await request(`/${booking._id}/receipt`,customer.firebaseUid)).status,409,"Unpaid bookings cannot produce paid receipts");
    await Booking.updateOne({_id:booking._id},{$set:{paymentStatus:"paid",paidAt:new Date()}});
    const scanned = (await verify(staff.firebaseUid)).body.data;
    assert.equal(scanned.paymentStatus,"paid"); assert.equal(scanned.valid,true);
    assert.ok(!('qrPayload' in scanned));
    const receipt = await request(`/${booking._id}/receipt`,customer.firebaseUid);
    assert.equal(receipt.status,200); assert.match(receipt.body.data.receipt,/ETB 200.00/); assert.ok(!receipt.body.data.receipt.includes('$'));
    assert.equal((await request(`/${booking._id}/receipt`,stranger.firebaseUid)).status,403);
    await StaffProfile.updateOne({_id:membership._id},{$set:{isActive:false}});
    assert.equal((await verify(staff.firebaseUid)).status,403,"Revoked membership cannot scan an old ticket");
    await Business.updateOne({_id:business._id},{$set:{requirePrepayment:true}});
    await Booking.updateOne({_id:booking._id},{$set:{paymentStatus:"unpaid"}});
    const historicalUnpaid = await request(path,customer.firebaseUid);
    assert.equal(historicalUnpaid.status,200);
    assert.equal(historicalUnpaid.body.data.valid,false,"Previously issued ticket remains viewable without claiming payment is valid");
    assert.equal((await verify(owner.firebaseUid)).body.data.valid,false,"Old QR cannot bypass required advance payment");
    await Booking.updateOne({_id:booking._id},{$set:{status:"pending"}});
    assert.equal((await request(path,customer.firebaseUid)).body.data.valid,false,"Existing ticket can be viewed as history when no longer confirmed");
    assert.equal((await verify(owner.firebaseUid)).body.data.valid,false);
    // Independent owners use the same endpoint and business ownership rules.
    await Business.updateOne({_id:business._id},{$set:{type:"independent"}});
    await Booking.updateOne({_id:booking._id},{$set:{status:"confirmed",paymentStatus:"paid"}});
    assert.equal((await verify(owner.firebaseUid)).body.data.valid,true);
    assert.equal(await BookingTicket.countDocuments({bookingId:booking._id}),1);
    console.log("Booking tickets: issuance, QR/reference verification, business permissions, live payment state and receipt access passed");
  } finally {
    await new Promise<void>(resolve => server.close(()=>resolve()));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); });
