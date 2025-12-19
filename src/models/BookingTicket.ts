import { Schema, model, Types } from "mongoose";

// Kept outside Booking so list endpoints cannot accidentally disclose QR tokens.
interface Ticket {
  bookingId: Types.ObjectId;
  reference: string;
  token: string;
  tokenHash: string;
  createdAt: Date;
}
const schema = new Schema<Ticket>({
  bookingId: { type: Schema.Types.ObjectId, required: true, unique: true, ref: "Booking" },
  reference: { type: String, required: true, unique: true },
  token: { type: String, required: true, select: false },
  tokenHash: { type: String, required: true, unique: true, select: false },
}, { timestamps: true });
export default model<Ticket>("BookingTicket", schema);
