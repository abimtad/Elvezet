import { Schema, model } from "mongoose";

const schema = new Schema({
  businessId: { type: Schema.Types.ObjectId, required: true, index: true },
  bookingId: Schema.Types.ObjectId,
  toPhone: { type: String, required: true, select: false },
  body: { type: String, required: true, select: false },
  idempotencyKey: { type: String, required: true, unique: true },
  event: { type: String, required: true },
  status: { type: String, enum: ["queued", "sending", "accepted", "sent", "delivered", "unknown", "simulated", "failed", "skipped"], default: "queued", index: true },
  reason: String,
  providerMessageId: String,
  attempts: { type: Number, default: 0 },
  leaseUntil: Date,
  reservationPeriod: Date,
  reservedUnits: { type: Number, default: 1 },
  segments: Number,
  providerAttemptedAt: Date,
  providerAcceptedAt: Date,
  statusCheckedAt: Date,
}, { timestamps: true });
export default model("SmsMessage", schema);
