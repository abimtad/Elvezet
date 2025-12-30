import { model, Schema } from "mongoose";

const schema = new Schema({
  name: { type: String, required: true, trim: true, unique: true },
}, { timestamps: true });

export default model("DiscoverCategory", schema);
