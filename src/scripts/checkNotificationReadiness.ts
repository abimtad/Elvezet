import mongoose from "mongoose";
import env from "../config/env";
import DeviceToken from "../models/DeviceToken";
import Notification from "../models/Notification";
import { smsMode } from "../services/sms-provider";

// Read-only operational check. Never prints user details, tokens or credentials.
async function main() {
  await mongoose.connect(env.MONGO_URI);
  try {
    const indexes = await DeviceToken.collection.indexes();
    const duplicates = await DeviceToken.aggregate([
      { $group: { _id: "$fcmToken", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }, { $count: "count" },
    ]);
    console.log(JSON.stringify({
      firebaseProjectConfigured: Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY),
      uniqueTokenIndex: indexes.some(index => index.unique && index.key.fcmToken === 1 && Object.keys(index.key).length === 1),
      duplicateTokenGroups: duplicates[0]?.count ?? 0,
      deliveryCounts: await Notification.aggregate([{ $group: { _id: "$deliveryStatus", count: { $sum: 1 } } }]),
      smsMode: smsMode(),
      externalDeviceDeliveryVerified: false,
    }, null, 2));
  } finally { await mongoose.disconnect(); }
}
void main().catch(error => { console.error("Notification readiness check failed", error.code || error.name); process.exitCode = 1; });
