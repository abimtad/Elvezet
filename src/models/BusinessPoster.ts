import { model, Schema } from "mongoose";

const schema = new Schema({
  title: { type: String, required: true, maxlength: 120 },
  imagePath: { type: String, required: true },
  placement: { type: String, enum: ["home", "clients", "both"], required: true },
  /** Who sees the poster. Existing rows without this field are treated as "both". */
  audience: {
    type: String,
    enum: ["staff", "independent", "both"],
    default: "both",
  },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  startAt: { type: Date, default: null },
  endAt: { type: Date, default: null },
  linkUrl: { type: String, default: "" },
}, { timestamps: true });
schema.index({ isActive: 1, placement: 1, audience: 1, sortOrder: 1 });
export default model("BusinessPoster", schema);
