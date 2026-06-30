import Message from "./models/Message";
import Notification from "./models/Notification";
import DeviceToken from "./models/DeviceToken";
import fs from "fs";
import path from "path";
import app from "./app";
import { connectDatabase } from "./config/database";
import env from "./config/env";
import { initializeFirebaseAdmin } from "./config/firebase";
import { connectRedis } from "./config/redis";
import { initializeQueues } from "./jobs/queue";
import { startExpiryWorker } from "./jobs/workers/expiry.worker";
import { startNotificationWorker } from "./jobs/workers/notification.worker";
import { startReminderWorker } from "./jobs/workers/reminder.worker";
import { startSmsWorker } from "./jobs/workers/sms.worker";
import { startBookingNotificationRecovery } from "./services/booking-notifications.service";
import { autoMarkNoShows } from "./services/booking.service";
import { initializeChatSocket } from "./services/chat.service";
import { initializeRealtimeSocket } from "./services/realtime.service";
import { createServer } from "http";
import { startAccountDeletionWorker } from "./services/account-deletion.service";
import { Server } from "socket.io";
import { initializeTrafficLimits } from './services/traffic-limit.service';

let noShowSweepTimer: NodeJS.Timeout | null = null;
let isNoShowSweepRunning = false;

const startNoShowSweeper = (): void => {
  const runSweep = async (): Promise<void> => {
    if (isNoShowSweepRunning) return;
    isNoShowSweepRunning = true;
    try {
      await autoMarkNoShows({ graceMinutes: env.NO_SHOW_GRACE_MINUTES });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("No-show sweep failed", error);
    } finally {
      isNoShowSweepRunning = false;
    }
  };

  void runSweep();
  noShowSweepTimer = setInterval(
    () => void runSweep(),
    env.NO_SHOW_SWEEP_INTERVAL_MINUTES * 60 * 1000,
  );
};

const createUploadFolders = (): void => {
  const uploadDirs = [
    "logos",
    "covers",
    "gallery",
    "avatars",
    "booking-screenshots",
    "id-cards",
  ];
  for (const dir of uploadDirs) {
    fs.mkdirSync(path.join(__dirname, "../uploads", dir), { recursive: true });
  }
};

const bootstrap = async (): Promise<void> => {
  createUploadFolders();
  await connectDatabase();
  // Enforce deduplication and token ownership before accepting API traffic.
  await Promise.all([Notification.init(), DeviceToken.init(), Message.init()]);

  try {
    const redisUrl = env.REDIS_URL.replace("PASSWORD", env.REDIS_PASSWORD);
    const redis = await connectRedis(redisUrl);
    if (redis) {
      await initializeTrafficLimits();
      initializeQueues();
      startNotificationWorker();
      startReminderWorker();
      startExpiryWorker();
      try { startSmsWorker(); } catch { console.warn("SMS worker unavailable; push remains active"); }
    } else {
      console.warn(
        "⚠️ Redis unavailable — API continues without queues/cache/locks",
      );
    }
  } catch (error) {
    console.warn(
      "⚠️ Redis or workers failed to initialize, skipping...",
      error instanceof Error ? error.message : error,
    );
  }

  try {
    initializeFirebaseAdmin({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY,
    });
  } catch (error) {
    console.warn("⚠️ Firebase failed to initialize, skipping...");
  }

  try {
    startNoShowSweeper();
  } catch (error) {
    console.warn("⚠️ Sweeper failed to initialize, skipping...");
  }

  const httpServer = createServer(app);
  startBookingNotificationRecovery();
  const { startPaymentVerificationRecovery } = await import("./services/bookingPaymentVerify.service");
  startPaymentVerificationRecovery();
  startAccountDeletionWorker();
  const io = new Server(httpServer, {
    maxHttpBufferSize: 65536,
    cors: {
      origin: true,
      credentials: true,
    },
  });
  initializeRealtimeSocket(io);
  initializeChatSocket(io);

  httpServer.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${env.PORT}`);
  });
};

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to bootstrap application", error);
  if (noShowSweepTimer) clearInterval(noShowSweepTimer);
  process.exit(1);
});
