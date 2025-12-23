import { Document, model, Schema, Types } from "mongoose";

export interface IDeviceToken extends Document {
  userId: Types.ObjectId;
  fcmToken: string;
  app: "customer" | "business" | "independent";
}

const deviceTokenSchema = new Schema<IDeviceToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fcmToken: { type: String, required: true, trim: true, unique: true },
    app: { type: String, enum: ["customer", "business", "independent"], default: "customer" },
  },
  { timestamps: true },
);

deviceTokenSchema.index({ userId: 1, fcmToken: 1 }, { unique: true });

export default model<IDeviceToken>("DeviceToken", deviceTokenSchema);
