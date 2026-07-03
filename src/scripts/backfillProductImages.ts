import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Business from "../models/Business";
import Product from "../models/Product";

async function main() {
  await mongoose.connect(process.env.MONGO_URI as string);
  const shops = await Business.find({ productsEnabled: true }).select(
    "_id coverImageUrl galleryUrls logoUrl",
  );
  let n = 0;
  for (const s of shops) {
    const img =
      (s.galleryUrls && s.galleryUrls[0]) || s.coverImageUrl || s.logoUrl || "";
    if (!img) continue;
    const r = await Product.updateMany(
      {
        businessId: s._id,
        $or: [
          { imageUrl: { $exists: false } },
          { imageUrl: "" },
          { imageUrl: null },
        ],
      },
      { $set: { imageUrl: img } },
    );
    n += r.modifiedCount;
  }
  console.log(`images set on ${n} products`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
