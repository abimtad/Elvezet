import { Document, model, Schema, Types } from "mongoose";

export interface IUser extends Document {
  firebaseUid: string;
  fullName: string;
  email: string;
  roles: Array<"customer" | "staff" | "owner" | "admin" | "moderator">;
  noShowCount: number;
  profilePicture?: string;
  phoneNumber?: string;
  isBanned?: boolean;
  needsPasswordReset?: boolean;
  isVerified?: boolean;
  idCardInfo?: any;
  deletionPendingAt?: Date;
  communityGuidelinesAcceptedAt?: Date;
  blockedUsers: Types.ObjectId[];
  notificationPreferences: { bookingUpdates: boolean; appointmentReminders: boolean; marketing: boolean };
}

const userSchema = new Schema<IUser>(
  {
    firebaseUid: { type: String, required: true, unique: true, index: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    roles: {
      type: [String],
      enum: ["customer", "staff", "owner", "admin", "moderator"],
      default: ["customer"],
    },
    phoneNumber: { type: String, trim: true },
    profilePicture: { type: String, trim: true },
    noShowCount: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false },
    needsPasswordReset: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    idCardInfo: { type: Schema.Types.Mixed },
    deletionPendingAt: { type: Date },
    communityGuidelinesAcceptedAt: { type: Date },
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    notificationPreferences: {
      bookingUpdates: { type: Boolean, default: true },
      appointmentReminders: { type: Boolean, default: true },
      marketing: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

export default model<IUser>("User", userSchema);
