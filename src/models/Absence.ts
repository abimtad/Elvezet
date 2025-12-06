import { Document, model, Schema, Types } from "mongoose";

export interface IAbsence extends Document {
  staffId: string;
  businessId: Types.ObjectId;
  startTime: Date;
  endTime: Date;
  reason?: string;
}

const absenceSchema = new Schema<IAbsence>(
  {
    staffId: {
      type: String,
      required: true,
      index: true,
    },
    businessId: {
      type: Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    reason: { type: String, trim: true },
  },
  { timestamps: true },
);

absenceSchema.index({ staffId: 1, startTime: 1, endTime: 1 });

export default model<IAbsence>("Absence", absenceSchema);
