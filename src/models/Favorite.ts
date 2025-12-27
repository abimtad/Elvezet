import { Document, Schema, Types, model } from "mongoose";

export interface IFavorite extends Document {
  userId: Types.ObjectId;
  businessId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const favoriteSchema = new Schema<IFavorite>(
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
  },
  { timestamps: true },
);

favoriteSchema.index({ userId: 1, businessId: 1 }, { unique: true });

export default model<IFavorite>("Favorite", favoriteSchema);
