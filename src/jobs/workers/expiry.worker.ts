import { Worker } from "bullmq";
import IORedis from "ioredis";
import { getRedisClient } from "../../config/redis";
import Booking from "../../models/Booking";

let expiryWorker: Worker | null = null;

export const startExpiryWorker = (): Worker => {
  const redis: IORedis = getRedisClient();

  if (!expiryWorker) {
    expiryWorker = new Worker(
      "booking-expiry",
      async (job) => {
        const { bookingId } = job.data as { bookingId: string };
        const booking = await Booking.findById(bookingId);

        if (!booking) {
          return { expired: false, reason: "booking-not-found" };
        }

        if (booking.status !== "pending") {
          return { expired: false, reason: "booking-not-pending" };
        }

        const hasScreenshot = Boolean(booking.paymentScreenshotUrl);
        if (hasScreenshot) {
          const createdAt = (booking as { createdAt?: Date }).createdAt;
          const pendingMs = createdAt
            ? Date.now() - new Date(createdAt).getTime()
            : 0;
          const twoHoursMs = 2 * 60 * 60 * 1000;

          if (pendingMs < twoHoursMs) {
            const remaining = twoHoursMs - pendingMs;
            const { getExpiryQueue } = await import("../queue");
            await getExpiryQueue()?.add("expire-booking", { bookingId }, { delay: remaining, jobId: `expiry-final-${bookingId}` });
            return {
              expired: false,
              reason: "screenshot-awaiting-verification",
            };
          }
        }

        await Booking.updateOne({ _id: booking._id, status: "pending", paymentStatus: "unpaid" }, { $set: { status: "expired" } });
        return { expired: true };
      },
      { connection: redis },
    );
  }

  return expiryWorker;
};
