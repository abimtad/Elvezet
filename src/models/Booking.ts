import { randomUUID } from "node:crypto";
import { Document, model, Schema, Types } from "mongoose";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "expired"
  | "no_show"
  | "no-show";
export type PaymentMethod =
  | "cash"
  | "in-shop"
  | "cbe"
  | "cbe_birr"
  | "telebirr"
  | "online_other"
  | "chapa";
export type PaymentStatus = "unpaid" | "paid";

export interface IBooking extends Document {
  userId: String;
  notificationEvents?: string[];
  notificationDispatched?: string[];
  businessId: Types.ObjectId;
  clientId?: Types.ObjectId;
  staffId: string;
  serviceIds: Types.ObjectId[];
  servicePriceSnapshots?: Array<{ serviceId: Types.ObjectId; unitPrice: number }>;
  serviceId?: Types.ObjectId;
  totalAmount: number;
  priceOverride?: number;
  appointmentNotes?: string;
  tipAmount?: number;
  isWalkIn?: boolean;
  paymentScreenshotUrl?: string;
  paymentVerificationStatus?:
    | "none"
    | "queued"
    | "verifying"
    | "verified"
    | "failed"
    | "mismatch"
    | "manual_review";
  bookingAssistantAskedAt?: Date;
  verifyEtRequestId?: string;
  verifiedTransactionKey?: string;
  verifyEtResult?: Record<string, unknown>;
  verifyEtCheckedAt?: Date;
  checkoutItems?: Array<{
    productId: Types.ObjectId;
    quantity: number;
    unitPrice: number;
    name: string;
  }>;
  staffPlan: Array<{
    staffId: string;
    serviceId: Types.ObjectId;
    startTime: Date;
    endTime: Date;
  }>;
  startTime: Date;
  endTime: Date;
  status: BookingStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paidAt?: Date;
  completedAt?: Date;
  staffProgress?: Array<{ staffId: string; aliases?: string[]; startedAt?: Date; completedAt?: Date }>;
  chapaTxRef?: string;
  cancelledBy?: Types.ObjectId;
  cancelledAt?: Date;
  cancellationReason?: string;
  noShowMarkedAt?: Date;
  retainedUntil?: Date;
}

const bookingSchema = new Schema<IBooking>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    notificationEvents: { type: [String], default: [] },
    notificationDispatched: { type: [String], default: [] },
    retainedUntil: { type: Date },
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    clientId: { type: Schema.Types.ObjectId, ref: "Client" },
    staffId: {
      type: String,
      required: true,
      index: true,
    },
    serviceIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Service" }],
      default: undefined,
    },
    serviceId: { type: Schema.Types.ObjectId, ref: "Service" },
    totalAmount: { type: Number, required: true, min: 0, default: 0 },
    servicePriceSnapshots: [{ serviceId: { type: Schema.Types.ObjectId, ref: "Service", required: true }, unitPrice: { type: Number, min: 0, required: true } }],
    priceOverride: { type: Number, min: 0 },
    isWalkIn: { type: Boolean, default: false },
    paymentScreenshotUrl: { type: String, trim: true },
    paymentVerificationStatus: {
      type: String,
      enum: [
        "none",
        "queued",
        "verifying",
        "verified",
        "failed",
        "mismatch",
        "manual_review",
      ],
      default: "none",
    },
    bookingAssistantAskedAt: { type: Date },
    verifyEtRequestId: { type: String, trim: true, index: true },
    verifiedTransactionKey: { type: String, unique: true, sparse: true },
    verifyEtResult: { type: Schema.Types.Mixed },
    verifyEtCheckedAt: { type: Date },
    checkoutItems: {
      type: [
        {
          productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
          quantity: { type: Number, required: true, min: 1 },
          unitPrice: { type: Number, required: true, min: 0 },
          name: { type: String, required: true, trim: true },
        },
      ],
      default: [],
    },
    staffPlan: {
      type: [
        {
          staffId: { type: String, required: true },
          serviceId: {
            type: Schema.Types.ObjectId,
            ref: "Service",
            required: true,
          },
          startTime: { type: Date, required: true },
          endTime: { type: Date, required: true },
        },
      ],
      default: [],
    },
    startTime: { type: Date, required: true, index: true },
    endTime: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "expired", "no_show", "no-show"],
      default: "pending",
    },
    appointmentNotes: { type: String, trim: true, maxlength: 2000 },
    completedAt: { type: Date },
    staffProgress: [{ staffId: { type: String, required: true }, aliases: [String], startedAt: Date, completedAt: Date }],
    tipAmount: { type: Number, min: 0, default: 0 },
    paymentMethod: {
      type: String,
      enum: [
        "cash",
        "in-shop",
        "cbe",
        "cbe_birr",
        "telebirr",
        "online_other",
        "chapa",
      ],
      default: "cash",
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
    },
    paidAt: { type: Date },
    chapaTxRef: { type: String, trim: true, index: true },
    cancelledBy: { type: String },
    cancelledAt: { type: Date },
    cancellationReason: { type: String, trim: true },
    noShowMarkedAt: { type: Date },
  },
  { timestamps: true },
);

bookingSchema.index({ staffId: 1, startTime: 1, endTime: 1, status: 1 });
bookingSchema.index({ staffId: 1, status: 1, paymentStatus: 1, startTime: 1 });
bookingSchema.index({ businessId: 1, startTime: 1 });
bookingSchema.index({ status: 1, paymentStatus: 1, paymentVerificationStatus: 1, verifyEtCheckedAt: 1 });
bookingSchema.index({ retainedUntil: 1 }, { expireAfterSeconds: 0 });

bookingSchema.pre("save", function () {
  const event = this.isNew ? "booking_created"
    : this.isModified("status") && this.status === "cancelled" ? "booking_cancelled"
    : ["startTime", "endTime", "staffId", "staffPlan"].some(key => this.isModified(key)) ? `booking_rescheduled:${randomUUID()}`
    : this.isModified("status") && this.status === "confirmed" ? "booking_confirmed" : undefined;
  if (event) this.notificationEvents = [...new Set([...(this.notificationEvents || []), event])];
});
export default model<IBooking>("Booking", bookingSchema);
