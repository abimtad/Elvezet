import { Document, model, Schema, Types } from "mongoose";

export interface IClient extends Document {
  businessId: Types.ObjectId;
  fullName: string;
  phoneNumber: string;
  email?: string;
  notes?: string;
  totalSpend: number;
  lastVisit?: Date;
}

const clientSchema = new Schema<IClient>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    fullName: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    notes: { type: String, trim: true },
    totalSpend: { type: Number, default: 0, min: 0 },
    lastVisit: { type: Date },
  },
  { timestamps: true },
);

clientSchema.index({ businessId: 1, phoneNumber: 1 }, { unique: true });

export default model<IClient>("Client", clientSchema);
