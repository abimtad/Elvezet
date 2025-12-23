import { Schema, model } from "mongoose";

// The same document is the inbox item and durable delivery outbox.
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  eventKey: { type: String, required: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true },
  businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
  audience: { type: String, enum: ["customer", "owner", "staff", "independent"], required: true },
  scheduleKey: String,
  staffAliases: [String],
  appointmentAt: Date,
  availableAt: { type: Date, required: true },
  publishedAt: Date,
  readAt: { type: Date, default: null },
  deliveryStatus: { type: String, enum: ["pending", "sending", "sent", "skipped", "failed", "obsolete"], default: "pending" },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, required: true },
  leaseUntil: Date,
  leaseId: String,
  retryTokens: { type: [String], default: undefined, select: false },
  lastError: String,
}, { timestamps: true });
schema.index({ userId: 1, eventKey: 1 }, { unique: true });
schema.index({ userId: 1, publishedAt: -1, _id: -1 });
schema.index({ deliveryStatus: 1, nextAttemptAt: 1, leaseUntil: 1 });
export default model("Notification", schema);
