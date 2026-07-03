/**
 * One-shot: enable product selling on all active shops and enrich existing
 * inventory products so the customer Marketplace has something to show
 * without a full reseed.
 *
 * Usage: npx tsx src/scripts/enableShopProducts.ts
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Business from "../models/Business";
import Product from "../models/Product";

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing");

  await mongoose.connect(uri);

  const shops = await Business.updateMany(
    { type: "shop", verificationStatus: "active" },
    { $set: { productsEnabled: true } },
  );

  const products = await Product.updateMany(
    {
      $or: [
        { category: { $exists: false } },
        { category: null },
        { category: "" },
      ],
    },
    {
      $set: {
        category: "General",
        description:
          "Premium product available from this shop. Ask staff for details in-store.",
        isActive: true,
      },
    },
  );

  console.log(
    `Enabled products on ${shops.modifiedCount} shops. Updated ${products.modifiedCount} product docs.`,
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
