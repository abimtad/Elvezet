import { Document, model, Schema, Types } from "mongoose";

export interface IReview extends Document {
  userId: Types.ObjectId;
  businessId: Types.ObjectId;
  rating: number;
  comment: string;
  isHidden: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, default: "" },
    isHidden: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

reviewSchema.index({ userId: 1, businessId: 1 }, { unique: true });

export default model<IReview>("Review", reviewSchema);
