import { Document, model, Schema, Types } from "mongoose";

export interface IMessage extends Document {
  bookingId: Types.ObjectId;
  senderId: string;
  senderType?: "human" | "assistant";
  assistantCode?: string;
  assistantEventKey?: string;
  text?: string;
  image?: string;
  createdAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    senderId: { type: String, required: true, index: true },
    senderType: { type: String, enum: ["human", "assistant"], default: "human" },
    assistantCode: { type: String },
    assistantEventKey: { type: String, select: false },
    text: { type: String, trim: true },
    image: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ bookingId: 1, createdAt: -1, _id: -1 });
messageSchema.index({ assistantEventKey: 1 }, { unique: true, sparse: true });

export default model<IMessage>("Message", messageSchema);
