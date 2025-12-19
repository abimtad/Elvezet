import { Schema, model } from "mongoose";

const account = new Schema({
  businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true },
  beneficiary: { type: String, required: true },
  revision: { type: Number, default: 0 },
}, { timestamps: true });
account.index({ businessId: 1, beneficiary: 1 }, { unique: true });
export const EarningsAccount = model("EarningsAccount", account);
const entry = new Schema({
  accountId: { type: Schema.Types.ObjectId, ref: "EarningsAccount", required: true },
  key: { type: String, required: true },
  type: { type: String, enum: ["earned", "reversal", "adjustment", "payout", "payout_reversal"], required: true },
  amountMinor: { type: Number, required: true, validate: Number.isSafeInteger },
  bookingId: { type: Schema.Types.ObjectId, ref: "Booking" },
  reversesId: { type: Schema.Types.ObjectId, ref: "EarningsEntry" },
  actorId: { type: Schema.Types.ObjectId, ref: "User" },
  reason: { type: String, required: true },
  method: String,
  reference: String,
  recordedAt: { type: Date, default: Date.now },
}, { timestamps: true });
entry.index({ accountId: 1, key: 1 }, { unique: true });
entry.index({ accountId: 1, recordedAt: -1, _id: -1 });
export const EarningsEntry = model("EarningsEntry", entry);
const accrual = new Schema({
  accountId: { type: Schema.Types.ObjectId, required: true },
  bookingId: { type: Schema.Types.ObjectId, required: true },
  amountMinor: { type: Number, required: true },
  active: { type: Boolean, required: true },
  rate: { type: Number, required: true },
  productRate: { type: Number, default: 0 },
  version: { type: Number, default: 1 },
}, { timestamps: true });
accrual.index({ accountId: 1, bookingId: 1 }, { unique: true });
export const EarningsAccrual = model("EarningsAccrual", accrual);
