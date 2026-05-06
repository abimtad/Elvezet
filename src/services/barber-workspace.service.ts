import { Types } from "mongoose";
import User from "../models/User";
import StaffProfile from "../models/StaffProfile";
import Business from "../models/Business";
import Booking from "../models/Booking";
import Service from "../models/Service";
import Client from "../models/Client";
import ApiError from "../utils/ApiError";
import { toPublicUrl } from "./media.service";

export async function barberContext(userId: Types.ObjectId, businessId?: string) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(401, "Sign in again");
  const aliases = [String(user._id), user.firebaseUid];
  if (businessId && !Types.ObjectId.isValid(businessId)) throw new ApiError(400, "Invalid workspace");
  const profiles = await StaffProfile.find({ staffId: { $in: aliases }, isActive: true, ...(businessId ? { businessId } : {}) });
  const shops = await Business.find({ _id: { $in: profiles.map(p => p.businessId) }, type: "shop" }).lean();
  if (shops.length !== 1) throw new ApiError(409, shops.length ? "Ask your shop to confirm your primary staff membership" : "Your shop must add an active staff profile before you can use this app");
  const business = shops[0];
  const profile = profiles.find(p => String(p.businessId) === String(business._id))!;
  return { user, profile, business, aliases: [...new Set([...aliases, profile.staffId])] };
}
export type BarberContext = Awaited<ReturnType<typeof barberContext>>;
export const ownBookings = (ctx: BarberContext) => ({ businessId: ctx.business._id, $or: [{ staffId: { $in: ctx.aliases } }, { "staffPlan.staffId": { $in: ctx.aliases } }] });

export function staffCommission(booking: any, aliases: string[], rate: number, productRate = 0) {
  const services: any[] = booking.serviceIds || [];
  const price = new Map<string, number>(services.map(s => [String(s._id), Number(s.basePrice || 0)]));
  for (const item of booking.servicePriceSnapshots || []) price.set(String(item.serviceId), Number(item.unitPrice));
  const plan: any[] = booking.staffPlan || [];
  const totalBase = plan.length ? plan.reduce((n, p) => n + (price.get(String(p.serviceId)) || 0), 0) : services.reduce((n, s) => n + (price.get(String(s._id)) || 0), 0);
  const ownBase = plan.length ? plan.filter(p => aliases.includes(String(p.staffId))).reduce((n, p) => n + (price.get(String(p.serviceId)) || 0), 0) : totalBase;
  const productTotal = (booking.checkoutItems || []).reduce((n: number, item: any) => n + Number(item.quantity) * Number(item.unitPrice), 0);
  const netCharged = Math.max(0, Number(booking.totalAmount ?? totalBase) - Number(booking.tipAmount || 0));
  const chargedProducts = Math.min(productTotal, netCharged);
  const chargedServices = Math.max(0, netCharged - chargedProducts);
  const serviceEarning = (totalBase ? chargedServices * ownBase / totalBase : 0) * Math.max(0, Math.min(100, rate)) / 100;
  const productEarning = aliases.includes(String(booking.staffId)) ? chargedProducts * Math.max(0, Math.min(100, productRate)) / 100 : 0;
  return Math.round((serviceEarning + productEarning) * 100) / 100;
}

export async function workspaceBookings(ctx: BarberContext, from: Date, to: Date, extra: Record<string, unknown> = {}) {
  const bookings = await Booking.find({ ...ownBookings(ctx), ...extra, startTime: { $gte: from, $lt: to } })
    .populate({ path: "serviceIds", select: "name duration basePrice", model: Service }).lean();
  const users = await User.find({ $or: [{ _id: { $in: bookings.map(b => String(b.userId)).filter(Types.ObjectId.isValid) } }, { firebaseUid: { $in: bookings.map(b => String(b.userId)) } }] }).select("fullName phoneNumber profilePicture firebaseUid").lean();
  const clients = await Client.find({ _id: { $in: bookings.map(b => b.clientId).filter((id): id is Types.ObjectId => !!id) } }).select("fullName phoneNumber email").lean();
  return bookings.map(b => {
    const customer = (b.clientId ? clients.find(c => String(c._id) === String(b.clientId)) : users.find(u => String(u._id) === String(b.userId) || u.firebaseUid === String(b.userId))) as any;
    const segments = b.staffPlan?.filter(p => ctx.aliases.includes(String(p.staffId))) || [];
    const progress = b.staffProgress?.find(p => ctx.aliases.includes(p.staffId));
    const start = segments.length ? new Date(Math.min(...segments.map(p => p.startTime.getTime()))) : b.startTime;
    const end = segments.length ? new Date(Math.max(...segments.map(p => p.endTime.getTime()))) : b.endTime;
    const cancelled = ["cancelled", "expired", "no-show", "no_show"].includes(b.status);
    return {
      _id: b._id, startTime: start, endTime: end, status: b.status,
      startedAt: progress?.startedAt, completedAt: progress?.completedAt || b.completedAt,
      state: cancelled ? b.status : progress?.completedAt || b.completedAt ? "completed" : progress?.startedAt ? "in_progress" : b.status,
      paymentStatus: b.paymentStatus, appointmentNotes: b.appointmentNotes || "",
      customer: { id: b.clientId ? `c-${b.clientId}` : `u-${b.userId}`, name: customer?.fullName || "Customer", phone: customer?.phoneNumber || "", image: customer?.profilePicture ? toPublicUrl(customer.profilePicture) : null },
      services: (b.serviceIds as any[]).filter(s => !segments.length || segments.some(p => String(p.serviceId) === String(s._id))).map(s => ({ name: s.name, duration: s.duration })),
      commissionEstimate: staffCommission(b, ctx.aliases, ctx.profile.serviceCommission.value, ctx.profile.productCommission),
      paidCommission: b.paymentStatus === "paid" && !cancelled ? staffCommission(b, ctx.aliases, ctx.profile.serviceCommission.value, ctx.profile.productCommission) : 0,
      createdAt: (b as any).createdAt, updatedAt: (b as any).updatedAt,
    };
  }).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

export const ethiopianDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
export function dateWindow(date: string, days = 1) {
  const from = new Date(`${date}T00:00:00+03:00`);
  if (Number.isNaN(from.getTime()) || ethiopianDay(from) !== date) throw new ApiError(400, "Choose a valid date");
  return { from, to: new Date(from.getTime() + days * 86400000) };
}
