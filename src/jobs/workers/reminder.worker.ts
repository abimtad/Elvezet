import { Worker } from "bullmq";
import IORedis from "ioredis";
import { getRedisClient } from "../../config/redis";
import { sendPushToUser } from "../../services/notification.service";
import Booking from "../../models/Booking";

let reminderWorker: Worker | null = null;

export const startReminderWorker = (): Worker => {
  const redis: IORedis = getRedisClient();

  if (!reminderWorker) {
    reminderWorker = new Worker(
      "reminders",
      async (job) => {
        const { userId, payload } = job.data as {
          userId: string;
          payload: {
            notification: { title: string; body: string };
            data?: Record<string, string>;
          };
        };
        const booking = await Booking.findById(payload.data?.bookingId).lean();
        if (!booking || booking.status !== "confirmed" || booking.completedAt) return;
        const aliases: string[] = job.data.staffAliases || [];
        const segments = booking.staffPlan.filter(p => aliases.includes(p.staffId));
        if (aliases.length && !segments.length && !aliases.includes(booking.staffId)) return;
        if (aliases.length && booking.staffProgress?.some(p => aliases.includes(p.staffId) && p.completedAt)) return;
        const start = segments.length ? new Date(Math.min(...segments.map(p => p.startTime.getTime()))) : booking.startTime;
        if (start <= new Date() || payload.data?.staffStartTime && payload.data.staffStartTime !== start.toISOString()) return;
        if (payload.data?.startTime && payload.data.startTime !== booking.startTime.toISOString()) return;
        const result = await sendPushToUser(userId, payload, job.data.retryTokens);
        if (result.retryTokens?.length) {
          await job.updateData({ ...job.data, retryTokens: result.retryTokens });
          throw new Error("push_delivery_retry");
        }
      },
      { connection: redis },
    );
    reminderWorker.on("error", () => console.warn("reminder_worker_error"));
  }

  return reminderWorker;
};
