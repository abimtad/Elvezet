import { getRedisClient, isRedisReady } from "../config/redis";

export const invalidatePublicBusinessCache = async () => {
  if (!isRedisReady()) return;
  try {
  const redis = getRedisClient();
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "businesses:list:*", "COUNT", 100);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== "0");
  } catch {
    // Optional cache failures must not turn a saved business change into an API error.
  }
};

export const getCachedJson = async <T>(key: string): Promise<T | null> => {
  try {
    const redis = getRedisClient();
    const value = await redis.get(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
};

export const setCachedJson = async (
  key: string,
  data: unknown,
  ttlSeconds: number,
): Promise<void> => {
  try {
    const redis = getRedisClient();
    await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
  } catch {
    // Redis is optional in local/dev mode.
  }
};

export const delCachedKey = async (key: string): Promise<void> => {
  try {
    const redis = getRedisClient();
    await redis.del(key);
  } catch {
    // Redis is optional in local/dev mode.
  }
};
