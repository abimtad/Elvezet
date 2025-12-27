import { Document, model, Schema, Types } from "mongoose";

export interface IProduct extends Document {
  businessId: Types.ObjectId;
  name: string;
  brand?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  price: number;
  stockQuantity: number;
  minStockAlert: number;
  isActive: boolean;
  ratingAverage: number;
  ratingCount: number;
}

const productSchema = new Schema<IProduct>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    brand: { type: String, trim: true },
    category: { type: String, trim: true, default: "General" },
    description: { type: String, trim: true, default: "" },
    imageUrl: { type: String, trim: true, default: "" },
    price: { type: Number, required: true, min: 0 },
    stockQuantity: { type: Number, default: 0, min: 0 },
    minStockAlert: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

productSchema.index({ businessId: 1, name: 1 }, { unique: true });
productSchema.index({ isActive: 1, createdAt: -1 });

export default model<IProduct>("Product", productSchema);
