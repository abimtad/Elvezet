import { Worker } from "bullmq";
import IORedis from "ioredis";
import { getRedisClient } from "../../config/redis";
import { sendPushToUser } from "../../services/notification.service";

let notificationWorker: Worker | null = null;

export const startNotificationWorker = (): Worker => {
  const redis: IORedis = getRedisClient();

  if (!notificationWorker) {
    notificationWorker = new Worker(
      "notifications",
      async (job) => {
        const { userId, payload } = job.data as {
          userId: string;
          payload: {
            notification: { title: string; body: string };
            data?: Record<string, string>;
          };
        };
        const result = await sendPushToUser(userId, payload, job.data.retryTokens);
        if (result.retryTokens?.length) {
          await job.updateData({ ...job.data, retryTokens: result.retryTokens });
          throw new Error("push_delivery_retry");
        }
      },
      { connection: redis },
    );
    notificationWorker.on("error", () => console.warn("push_worker_error"));
  }

  return notificationWorker;
};
