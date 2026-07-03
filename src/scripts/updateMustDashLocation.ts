import dotenv from "dotenv";
import mongoose from "mongoose";
import Business from "../models/Business";
import Category from "../models/Category";
import {
  MUSTDASH_LOCATION,
  SHOP_NAME,
  mustDashGeoPoint,
} from "./mustDashSeedConfig";

dotenv.config();

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const business = await Business.findOne({ name: SHOP_NAME });
  if (!business) {
    throw new Error(`${SHOP_NAME} business was not found`);
  }

  const category = await Category.findOneAndUpdate(
    { name: "Barber Shop" },
    { $set: { name: "Barber Shop", isActive: true } },
    { returnDocument: "after", upsert: true },
  );

  business.location = mustDashGeoPoint();
  business.homeLocation = mustDashGeoPoint();
  business.addressString = MUSTDASH_LOCATION.addressString;
  business.businessCategoryId = category._id;
  business.businessCategoryName = category.name;
  await business.save();

  console.log(`Updated ${SHOP_NAME} location`);
  console.log(`Business category: ${category.name}`);
  console.log(`Address: ${MUSTDASH_LOCATION.addressString}`);
  console.log(
    `Coordinates: ${MUSTDASH_LOCATION.latitude}, ${MUSTDASH_LOCATION.longitude}`,
  );
}

main()
  .catch((error) => {
    console.error("Failed to update Must Dash location:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
