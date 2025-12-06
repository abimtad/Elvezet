import { Document, model, Schema, Types } from "mongoose";

export interface IStaffProfile extends Document {
  staffId: string;
  businessId: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  permissionLevel: "low" | "medium" | "high";
  hourlyWage: number;
  serviceCommission: {
    type: "fixed" | "tiered";
    value: number;
  };
  productCommission: number;
  biography?: string;
  profilePicture?: string;
  isBookableInCalendar: boolean;
  services: Types.ObjectId[];
  specialties: string[];
  isActive: boolean;
  isOnlineVisible: boolean;
  inboxReadAt?: Date;
}

const staffProfileSchema = new Schema<IStaffProfile>(
  {
    staffId: {
      type: String,
      required: true,
      index: true,
    },
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    role: { type: String, trim: true },
    permissionLevel: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low",
    },
    hourlyWage: { type: Number, default: 0 },
    serviceCommission: {
      type: { type: String, enum: ["fixed", "tiered"], default: "fixed" },
      value: { type: Number, default: 0 },
    },
    productCommission: { type: Number, default: 0 },
    biography: { type: String, trim: true },
    profilePicture: { type: String, trim: true },
    isBookableInCalendar: { type: Boolean, default: true },
    services: [{ type: Schema.Types.ObjectId, ref: "Service" }],
    specialties: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
    isOnlineVisible: { type: Boolean, default: true },
    inboxReadAt: Date,
  },
  { timestamps: true },
);

staffProfileSchema.index({ staffId: 1, businessId: 1 }, { unique: true });

export default model<IStaffProfile>("StaffProfile", staffProfileSchema);
