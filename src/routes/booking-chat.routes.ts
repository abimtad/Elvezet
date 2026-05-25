import { Router } from "express";
import { Types } from "mongoose";
import auth from "../middlewares/auth.middleware";
import asyncHandler from "../utils/asyncHandler";
import ApiError from "../utils/ApiError";
import Service from "../models/Service";
import { buildPaymentGuidance } from "../services/booking-payment-guidance";
import Message from "../models/Message";
import { ensureBookingParticipants, emitChatMessage } from "../services/chat.service";

const router = Router();
router.param("id", (_req, _res, next, id) => next(Types.ObjectId.isValid(id) ? undefined : new ApiError(400, "Invalid booking ID")));
router.get("/:id/messages", auth, asyncHandler(async (req, res) => {
  await ensureBookingParticipants(String(req.params.id), String(req.user!._id), req.user!);
  const before = req.query.before ? new Date(String(req.query.before)) : null;
  if (before && !Number.isFinite(before.getTime())) throw new ApiError(400, "Invalid message cursor");
  const messages = await Message.find({ bookingId: req.params.id, ...(before ? { createdAt: { $lt: before } } : {}) }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ data: messages.reverse().map(presentChatMessage) });
}));
router.post("/:id/messages", auth, asyncHandler(async (req, res) => {
  if (typeof req.body.text !== "string") throw new ApiError(400, "Enter a text message");
  const message = await emitChatMessage({ bookingId: String(req.params.id), senderId: String(req.user!._id), text: req.body.text.trim() });
  res.status(201).json({ data: message });
}));
// Read-only, participant-scoped guidance. Never returns raw provider payloads.
router.get("/:id/payment-guidance", auth, asyncHandler(async (req, res) => {
  const context = await ensureBookingParticipants(String(req.params.id), String(req.user!._id), req.user!);
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ data: await guidanceFor(context) });
}));
// One authorization pass and parallel reads for opening current or past chats.
router.get("/:id/conversation", auth, asyncHandler(async (req, res) => {
  const context = await ensureBookingParticipants(String(req.params.id), String(req.user!._id), req.user!);
  const [messages, guidance] = await Promise.all([
    Message.find({ bookingId: context.booking._id }).sort({ createdAt: -1, _id: -1 }).limit(50).lean(),
    guidanceFor(context),
  ]);
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ data: { messages: messages.reverse().map(presentChatMessage), guidance } });
}));
function presentChatMessage<T extends { assistantCode?: string; text?: string }>(message: T) {
  if (message.assistantCode !== "booking_intent") return message;
  return { ...message, assistantCode: "receipt_hint", text: "If you are trying to complete this booking, send a clear payment receipt screenshot. If you have already paid, do not pay again. You can also message the business here." };
}
async function guidanceFor({ booking, business }: Awaited<ReturnType<typeof ensureBookingParticipants>>) {
  const ids = booking.serviceIds?.length ? booking.serviceIds : booking.serviceId ? [booking.serviceId] : [];
  const services = ids.length ? await Service.find({ _id: { $in: ids } }).select("name").lean() : [];
  return { bookingId: String(booking._id), services: services.map(service => service.name),
    appointmentAt: booking.startTime, paymentMethod: booking.paymentMethod,
    ...buildPaymentGuidance(booking, business) };
}
export default router;
