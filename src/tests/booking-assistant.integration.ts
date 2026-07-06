import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import env from "../config/env";
import app from "../app";
import User from "../models/User";
import Business from "../models/Business";
import Booking from "../models/Booking";
import Message from "../models/Message";
import { startVerifyEtForScreenshot, applyVerifyEtResultToBooking } from "../services/bookingPaymentVerify.service";
import { emitChatMessage } from "../services/chat.service";
async function main() {
  process.env.NODE_ENV = "development";
  const database = `chat_test_${randomUUID().replaceAll("-", "").slice(0,16)}`;
  await mongoose.connect(env.MONGO_URI, {dbName: database});
  const server = app.listen(0,"127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as {port:number}).port;
  await Message.init();
  try {
    const owner = await User.create({firebaseUid:"assistant-owner", fullName:"Owner", email:"owner@example.test", roles:["owner"]});
    const customer = await User.create({firebaseUid:"assistant-customer", fullName:"Customer", email:"customer@example.test"});
    const stranger = await User.create({firebaseUid:"assistant-other", fullName:"Other", email:"other@example.test"});
    const business = await Business.create({name:"Assistant Test", ownerId:owner._id, type:"independent", location:{type:"Point",coordinates:[38,9]}, homeLocation:{type:"Point",coordinates:[38,9]}, settlementAccount:"test-account",settlementBank:"cbe"});
    const make = () => Booking.create({userId:String(customer._id),businessId:business._id,staffId:"test",serviceIds:[],staffPlan:[],totalAmount:1500,startTime:new Date(Date.now()+3600000),endTime:new Date(Date.now()+5400000),status:"pending",paymentMethod:"cbe"});
    const booking = await make();
    await emitChatMessage({bookingId:String(booking._id),senderId:String(owner._id),text:"Hello"});
    assert.equal(await Message.countDocuments({senderType:"assistant"}),0,"Business replies must not trigger a question");
    await emitChatMessage({bookingId:String(booking._id),senderId:String(customer._id),text:"Receipt",image:"test-receipt"});
    assert.equal(await Message.countDocuments({senderType:"assistant"}),0,"Receipt upload must not trigger the text question");
    await Promise.all(["hello","are you there","question"].map(text => emitChatMessage({bookingId:String(booking._id),senderId:String(customer._id),text})));
    assert.equal(await Message.countDocuments({bookingId:booking._id,senderType:"assistant"}),1,"Ask only once across concurrent sends");
    const url = `http://127.0.0.1:${port}/api/v1/bookings/${booking._id}`;
    const request = (suffix:string, uid?:string) => fetch(url+suffix,{headers:uid?{"x-dev-user-id":uid}:{}});
    assert.equal((await request("/payment-guidance")).status,401);
    assert.equal((await request("/payment-guidance",stranger.firebaseUid)).status,403);
    for (const uid of [owner.firebaseUid,customer.firebaseUid]) {
      const response = await request("/payment-guidance",uid);
      assert.equal(response.status,200);
      assert.equal((await response.json() as any).data.receivingAccount,"test-account");
      const messages = await (await request("/messages",uid)).json() as any;
      assert.equal(messages.data.filter((message:any)=>message.senderType==="assistant").length,1,"Both participants see the labelled assistant message");
    }
    assert.equal((await Booking.findById(booking._id))!.paymentStatus,"unpaid","Chat cannot approve payment");
    let reads=0;
    mongoose.set("debug", (_collection:string,method:string)=>{if(["find","findOne"].includes(method)) reads++;});
    await request("/messages",owner.firebaseUid);await request("/payment-guidance",owner.firebaseUid);
    const separateReads=reads;reads=0;
    await request("/conversation",owner.firebaseUid);
    const combinedReads=reads;mongoose.set("debug",false);
    assert.ok(combinedReads < separateReads, "Opening chat must use fewer database reads than two separate endpoints");
    const combined = await request("/conversation", customer.firebaseUid);
    assert.equal(combined.status, 200);
    const conversation = (await combined.json() as any).data;
    assert.equal(conversation.guidance.receivingAccount,"test-account");
    assert.equal(conversation.messages.find((message:any)=>message.senderType==="assistant").assistantCode,"receipt_hint");
    assert.ok(!conversation.messages.find((message:any)=>message.senderType==="assistant").text.includes("Choose Yes"));
    assert.equal((await request("/conversation", stranger.firebaseUid)).status,403);
    // Existing question records are presented as informational instructions too.
    await Message.updateOne({bookingId:booking._id,senderType:"assistant"},{$set:{assistantCode:"booking_intent",text:"Choose Yes or No"}});
    const legacy = (await (await request("/conversation",owner.firebaseUid)).json() as any).data;
    assert.equal(legacy.messages.find((message:any)=>message.senderType==="assistant").assistantCode,"receipt_hint");
    // Past chat opening never contacts the receipt provider.
    await Booking.updateOne({_id:booking._id},{$set:{status:"expired"}});
    assert.equal((await request("/conversation",customer.firebaseUid)).status,200);
    await Booking.updateOne({_id:booking._id},{$set:{status:"pending"}});
    const originalFetch=globalThis.fetch;
    let submissions=0, statusChecks=0;
    const base=(env.VERIFY_ET_BASE_URL || "https://verify.et").replace(/\/$/,"");
    globalThis.fetch=async(input,init)=>{
      const address=String(input);
      if(address.startsWith(base+"/api/verify")){
        if(init?.method==="POST") {submissions++;assert.equal(new URL(address).searchParams.has("waitMs"),false);}
        else statusChecks++;
        return new Response(JSON.stringify({requestId:"speed-request",processingStatus:"queued"}),{status:202,headers:{"Content-Type":"application/json"}});
      }
      return originalFetch(input,init);
    };
    try{
      const receipt={bookingId:String(booking._id),userId:String(customer._id),imageBuffer:Buffer.from("test-only-receipt"),mimeType:"image/png",screenshotUrl:"/uploads/booking-screenshots/test/receipt.webp"};
      const [submitted] = await Promise.all([startVerifyEtForScreenshot(receipt),startVerifyEtForScreenshot(receipt)]);
      assert.equal(submitted.paymentVerificationStatus,"queued");assert.equal(submitted.paymentStatus,"unpaid");
      assert.equal(submissions,1);assert.equal(statusChecks,0,"Upload must not wait for a second provider status request");
    }finally{globalThis.fetch=originalFetch;}
    await applyVerifyEtResultToBooking(String(booking._id),{requestId:"speed-request",processingStatus:"completed",verified:false,status:"failed"});
    await applyVerifyEtResultToBooking(String(booking._id),{requestId:"speed-request",processingStatus:"completed",verified:false,status:"failed"});
    assert.equal(await Message.countDocuments({bookingId:booking._id,assistantCode:"payment_not_verified"}),1,"Repeated callbacks must not repeat a denial message");
    await applyVerifyEtResultToBooking(String(booking._id),{requestId:"speed-request",processingStatus:"completed",verified:true,status:"success",bank:"cbe",receiptNumber:"unique-reference",amount:1500,currency:"ETB",settlementAccountMatch:{matched:true}});
    await applyVerifyEtResultToBooking(String(booking._id),{requestId:"speed-request",verified:true,status:"success"});
    assert.equal(await Message.countDocuments({bookingId:booking._id,assistantCode:"payment_approved"}),1);

    console.log("PASS: one informational hint, combined past chat, scoped access, immediate verification submission and durable deduplicated decisions");
  } finally {
    await new Promise<void>(resolve => server.close(()=>resolve()));
    try {if(mongoose.connection.name===database && database.startsWith("chat_test_")) await mongoose.connection.dropDatabase();}
    finally {await mongoose.disconnect();}
  }
}
main().catch(error=>{console.error("Booking assistant integration failed", error.name, String(error.message).replace(/mongodb[^ ]+/g,"[database]"));process.exitCode=1;});
