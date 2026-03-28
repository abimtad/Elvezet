import type { Server, Socket } from "socket.io";
import Message, { IMessage } from "../models/Message";
import Booking, { IBooking } from "../models/Booking";
import { IBusiness } from "../models/Business";
import { IUser } from "../models/User";
import ApiError from "../utils/ApiError";
import User from "../models/User";
import { assertSafeText } from "./content-safety.service";
import { hasActiveShopMembership } from "./booking-access.service";
import { assertTraffic, policies } from './traffic-limit.service';
import { publishAuthorizedEvent } from './realtime.service';

const socketIdentity = async (socket: Socket): Promise<string> => {
  if (socket.data.userId && socket.data.expiresAt > Date.now()) return socket.data.userId;
  throw new ApiError(401, 'Reconnect your authenticated session');
};

let chatServer: Server | null = null;

type ChatJoinPayload = {
  bookingId: string;
  userId?: string;
  barberId?: string;
};

type SendMessagePayload = {
  bookingId: string;
  senderId: string;
  text?: string;
  image?: string;
};

const roomForBooking = (bookingId: string): string => `booking:${bookingId}`;

export const ensureBookingParticipants = async (
  bookingId: string,
  senderId: string,
  authenticatedSender?: IUser,
): Promise<{ barberId: string; userId: string; booking: IBooking; business: IBusiness; sender: IUser }> => {
  const booking = await Booking.findById(bookingId).populate(
    "businessId",
    "ownerId type name settlementAccount settlementBank paymentInstructions",
  );
  if (!booking) {
    throw new ApiError(404, "Booking not found");
  }

  const business = booking.businessId as unknown as IBusiness;
  if (!business?.ownerId) throw new ApiError(404, "Business not found");
  const barberId = String(business.ownerId);
  const userId = String(booking.userId);
  const businessId = String(business._id);
  const participantIds = [userId, barberId, ...(authenticatedSender ? [] : [senderId])];
  const users = await User.find({ $or: [
    { _id: { $in: participantIds.filter(id => /^[a-f0-9]{24}$/i.test(id)) } },
    { firebaseUid: userId },
  ] }).select("firebaseUid blockedUsers isBanned deletionPendingAt roles");
  const sender = authenticatedSender || users.find(user => String(user._id) === senderId);
  if (!sender || sender.isBanned || sender.deletionPendingAt) throw new ApiError(403, "Account unavailable");
  const customer = users.find(user => String(user._id) === userId || user.firebaseUid === userId);
  const participantAliases = [userId, customer ? String(customer._id) : userId, barberId];
  if (users.some(user => user.isBanned || user.deletionPendingAt ||
      user.blockedUsers.some(id => participantAliases.includes(String(id))))) {
    throw new ApiError(403, "This conversation is unavailable");
  }

  const isCustomer = [senderId, sender.firebaseUid].includes(userId);
  const isOwner = senderId === barberId;
  const isShopStaff = !isCustomer && !isOwner && await hasActiveShopMembership(businessId, sender);

  if (!isCustomer && !isOwner && !isShopStaff) {
    throw new ApiError(403, "Not allowed to send messages for this booking");
  }

  booking.depopulate("businessId");
  return { barberId, userId, booking, business, sender };
};

export const emitChatMessage = async (
  payload: SendMessagePayload,
  authorizedContext?: Awaited<ReturnType<typeof ensureBookingParticipants>>,
): Promise<IMessage> => {
  if (!payload.text?.trim() && !payload.image) throw new ApiError(400, "Enter a message");
  if ((payload.text?.length || 0) > 4000) throw new ApiError(400, "Message is too long");
  if (!/^[a-f\d]{24}$/i.test(payload.bookingId) || (payload.image?.length || 0) > 2048) throw new ApiError(400, 'Invalid message');
  await assertTraffic(policies.chat, payload.senderId);
  assertSafeText(payload.text || "");
  if (authorizedContext && (String(authorizedContext.booking._id) !== payload.bookingId || String(authorizedContext.sender._id) !== payload.senderId)) throw new ApiError(403, "Invalid conversation context");
  const participants = authorizedContext || await ensureBookingParticipants(payload.bookingId, payload.senderId);

  const message = await Message.create({
    bookingId: payload.bookingId,
    senderId: payload.senderId,
    text: payload.text,
    image: payload.image,
  });

  if (chatServer) {
    const eventPayload = {
      bookingId: payload.bookingId,
      senderId: payload.senderId,
      text: payload.text,
      image: payload.image,
      createdAt: message.createdAt,
    };

    publishAuthorizedEvent('message', eventPayload, payload.bookingId, true);
  }

  // Only the booking customer receives the one-time prompt. Claim it atomically
  // so concurrent REST/socket sends cannot each create a prompt.
  if (payload.text?.trim() && !payload.image) {
    try {
      const customerIds = [payload.senderId, participants.sender.firebaseUid].filter((id): id is string => typeof id === "string");
      const claimed = await Booking.findOneAndUpdate({
        _id: payload.bookingId, userId: { $in: customerIds }, status: "pending",
        paymentStatus: "unpaid", bookingAssistantAskedAt: { $exists: false },
      }, { $set: { bookingAssistantAskedAt: new Date() } }, { returnDocument: "after" });
      if (claimed) {
        const assistant = await Message.create({ bookingId: claimed._id,
          senderId: "booking-assistant", senderType: "assistant", assistantCode: "receipt_hint",
          text: "If you are trying to complete this booking, send a clear payment receipt screenshot. If you have already paid, do not pay again. You can also message the business here.",
        });
        if (chatServer) publishAuthorizedEvent('message', {
          ...assistant.toObject(), bookingId: payload.bookingId,
        }, payload.bookingId, true);
      }
    } catch {
      // An assistant failure must not report an already-saved human message as unsent.
      console.warn("Booking assistant prompt could not be created");
    }
  }
  return message;
};

export const initializeChatSocket = (io: Server): void => {
  chatServer = io;

  io.on("connection", (socket: Socket) => {
    socket.on("join-chat", async (payload: ChatJoinPayload) => {
      try {
      await assertTraffic(policies.join, await socketIdentity(socket));
      if (!payload || !/^[a-f\d]{24}$/i.test(payload.bookingId)) throw new ApiError(400, 'Invalid conversation');
      const participants = await ensureBookingParticipants(
        payload.bookingId,
        await socketIdentity(socket),
      );

      if (
        (payload.userId != null && participants.userId !== payload.userId) ||
        (payload.barberId != null && participants.barberId !== payload.barberId)
      ) {
        throw new ApiError(403, "Not allowed to join this chat room");
      }

      // Never join another person's identity-wide rooms from a chat request.
      for (const room of socket.rooms) if (room.startsWith('booking:')) await socket.leave(room);
      await socket.join(roomForBooking(payload.bookingId));
      } catch (error) { const denied = error as { statusCode?: number; retryAfter?: number };
        socket.emit("chat:error", { message: "Unable to join this conversation", code: denied.statusCode, retryAfter: denied.retryAfter }); }
    });

    socket.on("send-message", async (payload: SendMessagePayload, ack?: (response: { ok: boolean; error?: string; code?: number; retryAfter?: number }) => void) => {
      try {
        if (!payload || (payload.text !== undefined && typeof payload.text !== 'string') ||
            (payload.image !== undefined && typeof payload.image !== 'string')) throw new ApiError(400, 'Invalid message');
        await emitChatMessage({ ...payload, senderId: await socketIdentity(socket) });
        if (ack) ack({ ok: true });
      } catch (error) {
        if (ack) {
          ack({
            ok: false,
            error:
              error instanceof Error ? error.message : "Failed to send message",
            code: (error as { statusCode?: number }).statusCode,
            retryAfter: (error as { retryAfter?: number }).retryAfter,
          });
        }
      }
    });
  });
};
