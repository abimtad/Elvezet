import { Schema, model } from "mongoose";

// Separate from public profiles so password hashes never appear in auth/me.
const schema = new Schema({
  phone: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  failedAttempts: { type: Number, default: 0 },
  lockedUntil: Date,
}, { timestamps: true });
export default model("CustomerCredential", schema);
