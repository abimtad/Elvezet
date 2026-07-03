import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

await mongoose.connect(process.env.MONGO_URI);
const cutoff = new Date(Date.now() - 10 * 60 * 1000);
const r = await mongoose.connection.db.collection("bookings").updateMany(
  {
    paymentMethod: "chapa",
    paymentStatus: { $ne: "paid" },
    status: { $in: ["pending", "awaiting_payment", "confirmed"] },
    createdAt: { $lt: cutoff },
    $or: [
      { chapaTxRef: { $exists: false } },
      { cancellationReason: "chapa_init_failed" },
    ],
  },
  {
    $set: {
      status: "cancelled",
      cancellationReason: "orphan_chapa_hold_cleanup",
      cancelledAt: new Date(),
    },
  },
);
console.log("orphans_cancelled", r.modifiedCount);
await mongoose.disconnect();
