import { Types } from "mongoose";
import { getFirebaseAdmin } from "../config/firebase";
import DeviceToken, { IDeviceToken } from "../models/DeviceToken";
import User from "../models/User";
import { deliverPushBatches } from "./push-delivery";

type NotificationPayload = {
  notification: { title: string; body: string };
  data?: Record<string, string>;
};

export const saveDeviceToken = async (
  userId: Types.ObjectId,
  fcmToken: string,
  app: "customer" | "business" | "independent" = "customer",
): Promise<IDeviceToken> => {
  try { return await DeviceToken.findOneAndUpdate(
    { fcmToken },
    { userId, fcmToken, app },
    { new: true, upsert: true },
  ); } catch (error: any) {
    if (error.code !== 11000) throw error;
    return (await DeviceToken.findOneAndUpdate({ fcmToken }, { userId, app }, { returnDocument: "after" }))!;
  }
};

export const sendPushToUser = async (
  userId: string,
  payload: NotificationPayload,
  retryOnly?: string[],
  transport?: (tokens: string[], payload: NotificationPayload) => Promise<{ responses: Array<{ success: boolean; error?: { code?: string } }> }>,
): Promise<{ successCount: number; failureCount: number; retryTokens?: string[] }> => {
  const user = await User.findById(userId);
  if (!user || user.isBanned || user.deletionPendingAt) return { successCount: 0, failureCount: 0 };
  const type = payload.data?.type || "";
  const preference = ["booking_reminder", "booking_start"].includes(type) ? "appointmentReminders"
    : type.startsWith("booking_") ? "bookingUpdates" : "marketing";
  const allowed = user.notificationPreferences?.[preference] ?? preference !== "marketing";
  if (!allowed) return { successCount: 0, failureCount: 0 };
  const audience = payload.data?.audience;
  const apps = audience === "customer" ? ["customer"] : audience === "independent" ? ["business", "independent"] : ["business"];
  const tokens = await DeviceToken.find({ userId, ...(audience ? { app: { $in: apps } } : {}) }).select("fcmToken");
  if (!tokens.length) return { successCount: 0, failureCount: 0 };

  const admin = transport ? null : getFirebaseAdmin();
  const fcmTokens = tokens.map((t) => t.fcmToken).filter(token => !retryOnly || retryOnly.includes(token));
  const response = await deliverPushBatches(fcmTokens, batch => transport ? transport(batch, payload) : admin!.messaging().sendEachForMulticast({
    tokens: batch,
    notification: payload.notification,
    data: payload.data || {},
    android: { notification: { tag: payload.data?.notificationId } },
    apns: { headers: { "apns-collapse-id": payload.data?.notificationId || "booking" } },
    webpush: { notification: { tag: payload.data?.notificationId } },
  }));
  const invalidTokens = response.invalidTokens;

  if (invalidTokens.length > 0) {
    await DeviceToken.deleteMany({ userId, fcmToken: { $in: invalidTokens } });
  }

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
    retryTokens: response.retryTokens,
  };
};
