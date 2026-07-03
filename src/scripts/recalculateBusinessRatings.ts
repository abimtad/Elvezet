/**
 * Recalculate every shop rating from visible reviews. Does not delete reviews.
 * Usage: npx tsx src/scripts/recalculateBusinessRatings.ts
 */
import dotenv from "dotenv";
import { connectRedis, getRedisClient, isRedisReady } from "../config/redis";
import mongoose from "mongoose";
import Business from "../models/Business";
import { recalculateBusinessRating } from "../services/review.service";
import { invalidatePublicBusinessCache } from "../services/cache.service";

dotenv.config();

const connect = async () => {
  const rawUri = process.env.MONGO_URI;
  if (!rawUri) throw new Error("MONGO_URI is not defined");
  const mongoUri = rawUri
    .replace("<db_username>", process.env.MONGO_USER || "")
    .replace("<db_password>", process.env.MONGO_PASSWORD || "");
  await mongoose.connect(mongoUri);
};

const main = async () => {
  try {
    await connect();
    if (process.env.REDIS_URL) await connectRedis(process.env.REDIS_URL);
    const shops = await Business.find({}).select("_id name rating").lean();
    let updated = 0;
    for (const shop of shops) {
      const next = await recalculateBusinessRating(String(shop._id));
      if (Number(shop.rating || 0) !== next) updated += 1;
      console.log(`${shop.name}: ${shop.rating ?? 0} → ${next}`);
    }
    await invalidatePublicBusinessCache();
    console.log(`✅ Recalculated ${shops.length} shops (${updated} changed).`);
  } catch (error) {
    console.error("❌ Recalculate failed:", error);
    process.exitCode = 1;
  } finally {
    if (isRedisReady()) await getRedisClient().quit();
    await mongoose.disconnect();
  }
};

void main();
