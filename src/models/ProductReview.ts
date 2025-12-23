import { Document, model, Schema, Types } from "mongoose";

export interface IProductReview extends Document {
  userId: Types.ObjectId;
  productId: Types.ObjectId;
  businessId: Types.ObjectId;
  rating: number;
  comment: string;
  isHidden: boolean;
  /** Set only when create-time purchase check passes; never backfilled. */
  verifiedPurchase?: boolean;
}

const productReviewSchema = new Schema<IProductReview>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
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
    verifiedPurchase: { type: Boolean, default: undefined },
  },
  { timestamps: true },
);

productReviewSchema.index({ userId: 1, productId: 1 }, { unique: true });

export default model<IProductReview>("ProductReview", productReviewSchema);
