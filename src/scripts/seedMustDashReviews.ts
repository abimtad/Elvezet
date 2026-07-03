/**
 * Seeds demo customer reviews for Must Dash only (paid past visits).
 * Usage: npx tsx src/scripts/seedMustDashReviews.ts
 */
import dotenv from "dotenv";
import { connectRedis, getRedisClient, isRedisReady } from "../config/redis";
import mongoose from "mongoose";
import Booking from "../models/Booking";
import Business from "../models/Business";
import Review from "../models/Review";
import Service from "../models/Service";
import User from "../models/User";
import { createHash } from "node:crypto";
import { SHOP_NAME } from "./mustDashSeedConfig";
import { recalculateBusinessRating } from "../services/review.service";
import { invalidatePublicBusinessCache } from "../services/cache.service";

dotenv.config();

const REVIEWERS = [
  {
    firebaseUid: "mustdash-customer-dev",
    fullName: "Test Customer",
    email: "customer@test.com",
    phoneNumber: "+251911000099",
    rating: 5,
    comment: "Clean shop, sharp fade, and on time. Will come back.",
  },
  {
    firebaseUid: "mustdash-reviewer-hana",
    fullName: "Hana Bekele",
    email: "hana.reviewer@mustdash.local",
    phoneNumber: "+251911000201",
    rating: 5,
    comment: "Friendly staff and great beard trim.",
  },
  {
    firebaseUid: "mustdash-reviewer-yonas",
    fullName: "Yonas Alemu",
    email: "yonas.reviewer@mustdash.local",
    phoneNumber: "+251911000202",
    rating: 4,
    comment: "Solid haircut. Waiting area was a bit busy.",
  },
  {
    firebaseUid: "mustdash-reviewer-sara",
    fullName: "Sara Mekonnen",
    email: "sara.reviewer@mustdash.local",
    phoneNumber: "+251911000203",
    rating: 5,
    comment: "Professional service and fair price.",
  },
];

const connect = async () => {
  const rawUri = process.env.MONGO_URI;
  if (!rawUri) throw new Error("MONGO_URI is not defined");
  const mongoUri = rawUri
    .replace("<db_username>", process.env.MONGO_USER || "")
    .replace("<db_password>", process.env.MONGO_PASSWORD || "");
  await mongoose.connect(mongoUri);
};

const upsertReviewer = async (row: (typeof REVIEWERS)[number]) => {
  return User.findOneAndUpdate(
    { firebaseUid: row.firebaseUid },
    {
      $setOnInsert: {
        firebaseUid: row.firebaseUid,
        fullName: row.fullName,
        email: row.email,
        phoneNumber: row.phoneNumber,
        roles: ["customer"],
        communityGuidelinesAcceptedAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );
};

const seed = async () => {
  const business = await Business.findOne({ name: SHOP_NAME });
  if (!business) {
    throw new Error(`Shop "${SHOP_NAME}" not found. Run npm run seed:mustdash first.`);
  }

  const service = await Service.findOne({ businessId: business._id }).sort({
    sortOrder: 1,
  });
  if (!service) {
    throw new Error("Must Dash has no services to attach review visits to.");
  }


  const staffId = "mustdash-staff-abebe";
  let created = 0;

  for (const [index, row] of REVIEWERS.entries()) {
    const user = await upsertReviewer(row);
    const endTime = new Date(Date.now() - (index + 2) * 24 * 60 * 60 * 1000);
    const startTime = new Date(endTime.getTime() - service.duration * 60 * 1000);

    await Booking.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(createHash("sha256").update(`mustdash-review-visit:${business._id}:${row.firebaseUid}`).digest("hex").slice(0, 24)),
      },
      {
        $setOnInsert: {
          userId: String(user._id),
          businessId: business._id,
          staffId,
          serviceIds: [service._id],
          serviceId: service._id,
          totalAmount: service.basePrice,
          staffPlan: [
            {
              staffId,
              serviceId: service._id,
              startTime,
              endTime,
            },
          ],
          startTime,
          endTime,
          status: "confirmed",
          paymentMethod: "in-shop",
          paymentStatus: "paid",
          paidAt: startTime,
          completedAt: endTime,
        },
      },
      { upsert: true, new: true },
    );

    await Review.updateOne({ userId: user._id, businessId: business._id }, { $setOnInsert: {
      userId: user._id,
      businessId: business._id,
      rating: row.rating,
      comment: row.comment,
      isHidden: false,
    } }, { upsert: true });
    created += 1;
  }

  const average = await recalculateBusinessRating(String(business._id));
  await invalidatePublicBusinessCache();

  console.log(`✅ Seeded ${created} demo Must Dash reviews.`);
  console.log(`   Recalculated rating: ${average} from ${created} visible reviews.`);
};

const main = async () => {
  try {
    await connect();
    if (process.env.REDIS_URL) await connectRedis(process.env.REDIS_URL);
    await seed();
  } catch (error) {
    console.error("❌ Must Dash review seed failed:", error);
    process.exitCode = 1;
  } finally {
    if (isRedisReady()) await getRedisClient().quit();
    await mongoose.disconnect();
  }
};

void main();
