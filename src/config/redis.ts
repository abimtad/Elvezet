import IORedis from "ioredis";

let redisClient: IORedis | null = null;
let listenersAttached = false;
let redisReady = false;

const CONNECT_TIMEOUT_MS = 8000;

export const isRedisReady = (): boolean => redisReady && redisClient !== null;

const waitUntilReady = (client: IORedis, timeoutMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    if (client.status === "ready") {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Redis connect timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const onReady = () => {
      cleanup();
      resolve();
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timer);
      client.off("ready", onReady);
      client.off("error", onError);
    };

    client.once("ready", onReady);
    client.once("error", onError);
  });

export const connectRedis = async (
  redisUrl: string,
): Promise<IORedis | null> => {
  if (redisClient && redisReady) {
    return redisClient;
  }

  if (redisClient) {
    try {
      redisClient.disconnect(false);
    } catch {
      // ignore cleanup errors
    }
    redisClient = null;
    listenersAttached = false;
    redisReady = false;
  }

  redisClient = new IORedis(redisUrl, {
    // BullMQ requires null when Redis is used for queues
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    retryStrategy: (times) => {
      if (times >= 3) {
        return null;
      }
      return Math.min(times * 200, 1000);
    },
  });

  if (!listenersAttached) {
    redisClient.on("error", (error) => {
      // eslint-disable-next-line no-console
      console.error("Redis error:", error.message);
    });
    listenersAttached = true;
  }

  try {
    await waitUntilReady(redisClient, CONNECT_TIMEOUT_MS);
    await redisClient.ping();
    redisReady = true;
    console.log("✅ Connected to Redis successfully");
    return redisClient;
  } catch (error) {
    redisReady = false;
    console.warn(
      "⚠️ Redis not available, continuing without cache/queues/locks...",
      error instanceof Error ? error.message : error,
    );
    try {
      redisClient.disconnect(false);
    } catch {
      // ignore
    }
    redisClient = null;
    listenersAttached = false;
    return null;
  }
};

export const getRedisClient = (): IORedis => {
  if (!redisClient || !redisReady) {
    throw new Error("Redis client not initialized");
  }
  return redisClient;
};
