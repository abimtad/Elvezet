import { Schema, model } from "mongoose";

const schema = new Schema({
  businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, unique: true },
  status: { type: String, enum: ["trial", "active", "past_due", "paused", "cancelled"], default: "paused" },
  planCode: { type: String, default: "sms_basic" },
  monthlyQuota: { type: Number, default: 200, min: 0 },
  usedThisPeriod: { type: Number, default: 0, min: 0 },
  reservedThisPeriod: { type: Number, default: 0, min: 0 },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  enabledEvents: { type: [String], default: ["booking_created", "booking_confirmed"] },
  consentAt: Date,
  requestedAt: Date,
  adminEnabled: { type: Boolean, default: false },
  activatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  activatedAt: Date,
  trialGrantedAt: Date,
}, { timestamps: true });
export default model("SmsSubscription", schema);
