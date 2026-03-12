import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import Booking from "../models/Booking";
import BookingTicket from "../models/BookingTicket";
import Business from "../models/Business";
import User, { IUser } from "../models/User";
import Client from "../models/Client";
import ApiError from "../utils/ApiError";
import { hasActiveShopMembership } from "./booking-access.service";

const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export const parseTicketCode = (code: unknown): { token?: string; reference?: string } => {
  if (typeof code !== "string" || code.length > 160) throw new ApiError(400, "Enter a valid booking QR or reference");
  const text = code.trim();
  if (/^elvezet:ticket:v1:[a-f0-9]{64}$/.test(text)) return { token: text.slice(18) };
  if (/^ELV-[A-F0-9]{16}$/i.test(text)) return { reference: text.toUpperCase() };
  throw new ApiError(400, "Enter a valid booking QR or reference");
};

export async function ticketContext(id: string, user: IUser, businessOnly = false, workspace?: string) {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new ApiError(404, "Booking not found");
  const booking = await Booking.findById(id);
  if (!booking) throw new ApiError(404, "Booking not found");
  const business = await Business.findById(booking.businessId);
  if (!business) throw new ApiError(404, "Booking not found");
  const aliases = [String(user._id), user.firebaseUid];
  const isCustomer = aliases.includes(String(booking.userId));
  const isOwner = String(business.ownerId) === String(user._id);
  const isAssigned = [booking.staffId, ...booking.staffPlan.map(p => p.staffId)].some(id => aliases.includes(String(id)));
  const staffAllowed = !isOwner && isAssigned && await hasActiveShopMembership(business._id, user);
  if (businessOnly && workspace && workspace !== String(business._id)) throw new ApiError(403, "This ticket belongs to another business");
  if (!(isOwner || staffAllowed || (!businessOnly && isCustomer))) throw new ApiError(403, "You do not have access to this booking ticket");
  return { booking, business };
}

async function summary(context: Awaited<ReturnType<typeof ticketContext>>, reference: string) {
  const { booking, business } = context;
  await booking.populate("serviceIds", "name duration basePrice");
  await booking.populate("serviceId", "name duration basePrice");
  const userId = String(booking.userId);
  const customer = await User.findOne({ $or: [
    ...(Types.ObjectId.isValid(userId) ? [{ _id: userId }] : []), { firebaseUid: userId },
  ] }).select("fullName").lean();
  const client = !customer && booking.clientId ? await Client.findById(booking.clientId).select("fullName").lean() : null;
  const staffIds = [...new Set([booking.staffId, ...booking.staffPlan.map(p => p.staffId)])];
  const professionals = await User.find({ $or: [
    { _id: { $in: staffIds.filter(id => /^[a-f0-9]{24}$/i.test(id)) } }, { firebaseUid: { $in: staffIds } },
  ] }).select("fullName").lean();
  const services = ((booking.serviceIds?.length ? booking.serviceIds : booking.serviceId ? [booking.serviceId] : []) as unknown as Array<{_id: unknown; name: string; duration: number; basePrice: number}>).map(s => ({
    name: s.name, duration: s.duration,
    amount: booking.servicePriceSnapshots?.find(p => String(p.serviceId) === String(s._id))?.unitPrice ?? s.basePrice,
  }));
  return {
    bookingId: String(booking._id), reference, businessName: business.name,
    customerName: customer?.fullName || client?.fullName || "Customer",
    professionals: professionals.map(p => p.fullName), services,
    startTime: booking.startTime, endTime: booking.endTime,
    bookingStatus: booking.status, paymentStatus: booking.paymentStatus,
    paymentVerificationStatus: booking.paymentVerificationStatus || "none",
    amount: booking.totalAmount, currency: "ETB", paymentMethod: booking.paymentMethod,
    paidAt: booking.paidAt || null, receiptReference: booking.paymentStatus === "paid" ? `ELV-R-${String(booking._id).toUpperCase()}` : null,
    verifiedAt: new Date(),
    // Existing terminal states must not be represented as a current confirmed booking.
    valid: booking.status === "confirmed",
  };
}

export async function ensureTicketRecords(bookingIds: Types.ObjectId[]) {
  if (!bookingIds.length) return;
  await BookingTicket.init();
  try {
    await BookingTicket.bulkWrite(bookingIds.map(bookingId => {
      const token = randomBytes(32).toString("hex");
      return { updateOne: { filter: { bookingId }, update: { $setOnInsert: {
        bookingId, reference: `ELV-${randomBytes(8).toString("hex").toUpperCase()}`, token, tokenHash: digest(token),
      } }, upsert: true } };
    }), { ordered: false });
  } catch (error) {
    // Concurrent archive opens can race on the unique bookingId index.
    const errors = (error as { writeErrors?: Array<{code: number}> }).writeErrors;
    if (!errors?.length || errors.some(e => e.code !== 11000)) throw error;
  }
}

export async function getBookingTicket(id: string, user: IUser) {
  const context = await ticketContext(id, user);
  const { booking, business } = context;
  const eligible = booking.status === "confirmed" && (!(business.requirePrepayment || business.type === "independent") || booking.paymentStatus === "paid");
  let ticket = await BookingTicket.findOne({ bookingId: booking._id }).select("+token");
  if (!eligible && !ticket) {
    throw new ApiError(409, "A ticket is available after booking confirmation and any required advance payment");
  }
  if (!ticket) {
    await ensureTicketRecords([booking._id as Types.ObjectId]);
    ticket = await BookingTicket.findOne({ bookingId: booking._id }).select("+token");
    if (!ticket) throw new ApiError(503, "Could not issue ticket. Try again");
  }
  return { ...await summary(context, ticket.reference), valid: eligible, qrPayload: `elvezet:ticket:v1:${ticket.token}` };
}

export async function verifyBookingTicket(code: unknown, user: IUser, workspace?: string) {
  const parsed = parseTicketCode(code);
  const ticket = await BookingTicket.findOne(parsed.token ? { tokenHash: digest(parsed.token) } : { reference: parsed.reference });
  if (!ticket) throw new ApiError(404, "Invalid ticket: no issued booking ticket matches this code");
  const context = await ticketContext(String(ticket.bookingId), user, true, workspace);
  const result = await summary(context, ticket.reference);
  const paymentRequired = context.business.requirePrepayment || context.business.type === "independent";
  return { ...result, valid: result.valid && (!paymentRequired || result.paymentStatus === "paid") };
}
