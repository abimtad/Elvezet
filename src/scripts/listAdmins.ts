import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import User from "../models/User";

async function main() {
  await mongoose.connect(process.env.MONGO_URI as string);
  const admins = await User.find({ roles: "admin" })
    .select("fullName email firebaseUid roles")
    .lean();
  console.log(JSON.stringify(admins, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
