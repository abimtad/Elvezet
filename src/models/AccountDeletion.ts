import { model, Schema } from "mongoose";

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", unique: true, sparse: true },
  contact: { type: String, maxlength: 200 },
  status: { type: String, enum: ["verification_required", "pending", "complete"], default: "pending", index: true },
  attempts: { type: Number, default: 0 },
  processingUntil: Date,
  nextAttemptAt: Date,
  lastFailureStage: String,
  completedAt: Date,
  expiresAt: Date,
}, { timestamps: true });
schema.index({ completedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default model("AccountDeletion", schema);
