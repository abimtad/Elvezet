import { Document, model, Schema, Types } from "mongoose";

export interface IService extends Document {
  businessId: Types.ObjectId;
  name: string;
  duration: number;
  basePrice: number;
  isActive?: boolean;
  category?: string;
  categoryName?: string;
  sortOrder?: number;
}

const serviceSchema = new Schema<IService>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    duration: { type: Number, required: true, min: 5 },
    basePrice: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
    category: { type: String, default: "general", trim: true },
    categoryName: { type: String, default: "General", trim: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export default model<IService>("Service", serviceSchema);
