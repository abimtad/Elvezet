import mongoose from "mongoose";
import { Worker } from "bullmq";
import { getRedisClient } from "../../config/redis";
import SmsMessage from "../../models/SmsMessage";
import SmsSubscription from "../../models/SmsSubscription";
import { smsProvider, smsSegments, SmsProviderError } from "../../services/sms-provider";

export async function deliverSms(messageId: string) {
  const message = await SmsMessage.findOneAndUpdate({ _id: messageId, $or: [{ status: "queued" }, { status: "sending", leaseUntil: { $lt: new Date() } }] }, { $set: { status: "sending", leaseUntil: new Date(Date.now() + 60000) }, $inc: { attempts: 1 } }, { new: true }).select("+toPhone +body");
  if (!message) return;
  if (message.providerAttemptedAt) {
    if (message.providerMessageId) await finish(message, "accepted", message.providerMessageId, true, message.segments || undefined);
    else await SmsMessage.updateOne({ _id: message._id }, { $set: { status: "unknown", reason: "provider_request_uncertain" } });
    return;
  }
  const units = smsSegments(message.body);
  let accepted = false;
  try {
    const session = await mongoose.startSession();
    let allowed = false;
    let reservationPeriod = message.reservationPeriod;
    try {
      await session.withTransaction(async () => {
        allowed = false;
        reservationPeriod = message.reservationPeriod;
        const subscription = await SmsSubscription.findOne({ businessId: message.businessId, adminEnabled: true, status: { $in: ["trial", "active"] }, consentAt: { $exists: true }, periodEnd: { $gt: new Date() }, enabledEvents: message.event }).session(session);
        if (!subscription) return;
        if (message.reservationPeriod?.getTime() === subscription.periodStart.getTime()) { allowed = true; return; }
        const reserved = await SmsSubscription.findOneAndUpdate({ _id: subscription._id, $expr: { $lte: [{ $add: ["$usedThisPeriod", "$reservedThisPeriod", units] }, "$monthlyQuota"] } }, { $inc: { reservedThisPeriod: units } }, { session, new: true });
        if (!reserved) return;
        await SmsMessage.updateOne({ _id: message._id }, { $set: { reservationPeriod: subscription.periodStart, reservedUnits: units } }, { session });
        reservationPeriod = subscription.periodStart;
        allowed = true;
      });
      message.reservationPeriod = reservationPeriod;
      message.reservedUnits = units;
    } finally { await session.endSession(); }
    if (!allowed) {
      await SmsMessage.updateOne({ _id: message._id }, { $set: { status: "skipped", reason: "subscription_event_or_quota" } });
      await releaseReservation(message, false);
      return;
    }
    await SmsMessage.updateOne({ _id: message._id }, { $set: { providerAttemptedAt: new Date() } });
    const result = await smsProvider.send({ to: message.toPhone, body: message.body, idempotencyKey: message.idempotencyKey });
    accepted = !result.simulated;
    message.providerMessageId = result.providerMessageId;
    message.segments = result.segments || units;
    if (accepted) await SmsMessage.updateOne({ _id: message._id }, { $set: { providerMessageId: result.providerMessageId, segments: message.segments, providerAcceptedAt: new Date() } });
    await finish(message, result.simulated ? "simulated" : result.accepted ? "accepted" : "sent", result.providerMessageId, !result.simulated, result.segments);
  } catch (error) {
    const reason = error instanceof SmsProviderError ? error.reason : "provider_unavailable";
    if (accepted && message.providerMessageId) {
      await SmsMessage.updateOne({ _id: message._id }, { $set: { providerMessageId: message.providerMessageId, segments: message.segments, leaseUntil: new Date() } });
      return;
    }
    if (error instanceof SmsProviderError && error.kind === "ambiguous") {
      await SmsMessage.updateOne({ _id: message._id }, { $set: { status: "unknown", reason }, $unset: { leaseUntil: 1 } });
      return;
    }
    if (message.attempts >= 5 || error instanceof SmsProviderError && error.kind === "permanent") await finish(message, "failed", undefined, false, undefined, reason);
    else await SmsMessage.updateOne({ _id: message._id }, { $set: { status: "queued", reason }, $unset: { providerAttemptedAt: 1 } });
    throw new Error("sms_delivery_failed");
  }
}

async function releaseReservation(message: any, sent: boolean, session?: mongoose.ClientSession) {
  if (!message.reservationPeriod) return;
  await SmsSubscription.updateOne({ businessId: message.businessId, periodStart: message.reservationPeriod, reservedThisPeriod: { $gt: 0 } }, { $inc: { reservedThisPeriod: -(message.reservedUnits || 1), usedThisPeriod: sent ? (message.segments || message.reservedUnits || 1) : 0 } }, { session });
}
async function finish(message: any, status: string, providerMessageId: string | undefined, sent: boolean, segments?: number, reason?: string) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      message.segments = segments || message.reservedUnits || 1;
      const updated = await SmsMessage.updateOne({ _id: message._id, status: "sending" }, { $set: { status, providerMessageId, segments: message.segments, ...(providerMessageId && sent ? { providerAcceptedAt: new Date() } : {}), ...(reason ? { reason } : {}) }, $unset: { leaseUntil: 1, ...(!reason ? { reason: 1 } : {}) } }, { session });
      if (updated.modifiedCount) await releaseReservation(message, sent, session);
    });
  } finally { await session.endSession(); }
}
export const startSmsWorker = () => {
  const worker = new Worker("sms", job => deliverSms(job.data.messageId), { connection: getRedisClient(), concurrency: 2, limiter: { max: 10, duration: 1000 } });
  worker.on("error", () => console.warn("sms_worker_error"));
  return worker;
};
