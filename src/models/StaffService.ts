import { Document, model, Schema, Types } from "mongoose";

export interface IStaffService extends Document {
  staffId: Types.ObjectId;
  serviceId: Types.ObjectId;
  price: number;
}

const staffServiceSchema = new Schema<IStaffService>(
  {
    staffId: {
      type: Schema.Types.ObjectId,
      ref: "StaffProfile",
      required: true,
      index: true,
    },
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: "Service",
      required: true,
      index: true,
    },
    price: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

staffServiceSchema.index({ staffId: 1, serviceId: 1 }, { unique: true });

export default model<IStaffService>("StaffService", staffServiceSchema);
