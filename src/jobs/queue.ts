import { Queue } from "bullmq";
import IORedis from "ioredis";
import { getRedisClient } from "../config/redis";

let notificationQueue: Queue | null = null;
let reminderQueue: Queue | null = null;
let expiryQueue: Queue | null = null;
let smsQueue: Queue | null = null;

export const initializeQueues = (): void => {
  const redis: IORedis = getRedisClient();
  if (!smsQueue) smsQueue = new Queue("sms", { connection: redis });

  if (!notificationQueue) {
    notificationQueue = new Queue("notifications", { connection: redis });
  }

  if (!reminderQueue) {
    reminderQueue = new Queue("reminders", { connection: redis });
  }

  if (!expiryQueue) {
    expiryQueue = new Queue("booking-expiry", { connection: redis });
  }
};

export const getNotificationQueue = (): Queue => {
  if (!notificationQueue)
    throw new Error("Notification queue is not initialized");
  if (getRedisClient().status !== "ready") throw new Error("Notification queue connection unavailable");
  return notificationQueue;
};

export const getSmsQueue = (): Queue => {
  if (!smsQueue) throw new Error("SMS queue is not initialized");
  if (getRedisClient().status !== "ready") throw new Error("SMS queue connection unavailable");
  return smsQueue;
};

export const getReminderQueue = (): Queue => {
  if (!reminderQueue) throw new Error("Reminder queue is not initialized");
  if (getRedisClient().status !== "ready") throw new Error("Reminder queue connection unavailable");
  return reminderQueue;
};

export const getExpiryQueue = (): Queue => {
  if (!expiryQueue) throw new Error("Expiry queue is not initialized");
  return expiryQueue;
};
