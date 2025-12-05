import { Document, model, Schema } from "mongoose";

export interface ICategory extends Document {
  name: string;
  isActive: boolean;
}

const categorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

categorySchema.index({ name: 1 }, { unique: true });

export default model<ICategory>("Category", categorySchema);
