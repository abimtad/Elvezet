import { Document, model, Schema, Types } from "mongoose";

export interface IAvailability extends Document {
  staffId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

const availabilitySchema = new Schema<IAvailability>(
  {
    staffId: {
      type: String,
      required: true,
      index: true,
    },
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    startTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },
    endTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },
  },
  { timestamps: true },
);

availabilitySchema.index(
  { staffId: 1, dayOfWeek: 1, startTime: 1, endTime: 1 },
  { unique: true },
);

export default model<IAvailability>("Availability", availabilitySchema);
