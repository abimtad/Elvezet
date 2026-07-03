import { randomUUID } from "crypto";
import mongoose from "mongoose";
import env from "../config/env";
import SmsMessage from "../models/SmsMessage";
import SmsSubscription from "../models/SmsSubscription";
import { createSmsEthiopiaProvider, normalizeSmsPhone, smsProvider } from "../services/sms-provider";
import { deliverSms } from "../jobs/workers/sms.worker";

async function main() {
  const recipient = normalizeSmsPhone(process.env.SMS_TEST_RECIPIENT);
  if (process.env.SMS_TEST_APPROVED !== "true" || !recipient) throw new Error("An approved recipient is required");
  const database = `sms_probe_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  await mongoose.connect(env.MONGO_URI, { dbName: database });
  let preserve = false;
  try {
    const businessId = new mongoose.Types.ObjectId();
    await SmsSubscription.create({ businessId, status: "active", consentAt: new Date(), monthlyQuota: 1, periodStart: new Date(), periodEnd: new Date(Date.now() + 3600000) });
    const message = await SmsMessage.create({ businessId, toPhone: recipient, body: "Zolmi test: booking SMS notifications are connected. No real appointment was created.", event: "booking_created", idempotencyKey: `approved-test-${randomUUID()}` });
    // Only this explicitly approved single message uses the live adapter. Normal workers stay dry-run.
    const provider = createSmsEthiopiaProvider(() => process.env.SMS_API_KEY);
    smsProvider.send = provider.send;
    await deliverSms(String(message._id)).catch(() => undefined);
    let result = await SmsMessage.findById(message._id);
    preserve = result?.status === "unknown" || result?.status === "queued" || result?.status === "sending";
    if (result?.providerMessageId) {
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const status = await provider.status!(result.providerMessageId);
          await SmsMessage.updateOne({ _id: message._id }, { $set: { status, statusCheckedAt: new Date() } });
          if (status === "delivered") break;
        } catch { /* Status polling never resends the message. */ }
        if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 5000));
      }
      result = await SmsMessage.findById(message._id);
    }
    const subscription = await SmsSubscription.findOne({ businessId });
    console.log(JSON.stringify({ status: result?.status, reason: result?.reason, providerMessageId: result?.providerMessageId, usedSegments: subscription?.usedThisPeriod, ...(preserve ? { retainedAuditDatabase: database } : {}) }));
  } finally {
    if (mongoose.connection.name !== database || !database.startsWith("sms_probe_")) throw new Error("Unsafe cleanup target");
    if (!preserve) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}
main().catch(() => { console.error("SMS test could not complete; no automatic resend was attempted."); process.exitCode = 1; });
