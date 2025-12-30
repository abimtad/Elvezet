import { Document, model, Schema } from "mongoose";

export const DISCOVER_CATEGORIES = [
  "All",
  "Hairstyle",
  "Hair Care",
  "Makeup",
  "Beauty & Style",
] as const;

export type DiscoverCategory = (typeof DISCOVER_CATEGORIES)[number];

export interface IDiscoverVideo extends Document {
  title: string;
  creatorName: string;
  category: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  thumbnailUrl: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const discoverVideoSchema = new Schema<IDiscoverVideo>(
  {
    title: { type: String, required: true, trim: true },
    creatorName: { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    youtubeUrl: { type: String, required: true, trim: true },
    youtubeVideoId: { type: String, required: true, trim: true, index: true },
    thumbnailUrl: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    sortOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

discoverVideoSchema.index({ isActive: 1, sortOrder: 1, createdAt: -1 });

export default model<IDiscoverVideo>("DiscoverVideo", discoverVideoSchema);
