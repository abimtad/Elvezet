import { model, Schema } from "mongoose";

const schema = new Schema({
  reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  targetType: { type: String, enum: ["review", "product_review", "discover_video", "message", "business"], required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  reason: { type: String, enum: ["harassment", "hate", "sexual", "violence", "spam", "misleading", "other"], required: true },
  details: { type: String, default: "", maxlength: 1000 },
  status: { type: String, enum: ["open", "dismissed", "removed"], default: "open", index: true },
  resolvedAt: Date,
  resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
schema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true });
export default model("ContentReport", schema);
