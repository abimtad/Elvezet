import mongoose, { Types } from "mongoose";
import Business from "../models/Business";
import Booking from "../models/Booking";
import StaffProfile from "../models/StaffProfile";
import User from "../models/User";
import Service from "../models/Service";
import { EarningsAccount, EarningsAccrual, EarningsEntry } from "../models/Earnings";
import { staffCommission } from "./barber-workspace.service";
import { eligibleEarning, earningsTotals, moneyMinor } from "../utils/earnings";
import ApiError from "../utils/ApiError";

export async function earningsContext(businessId: string, beneficiary: string) {
  if (!Types.ObjectId.isValid(businessId)) throw new ApiError(400, "Invalid business");
  const business = await Business.findById(businessId).lean();
  if (!business) throw new ApiError(404, "Business not found");
  if (business.type === "independent") {
    if (beneficiary !== "self") throw new ApiError(400, "Choose the independent workspace earnings");
    return { business, beneficiary: "self", aliases: [] as string[], rate: 100, productRate: 0, label: business.name, independent: true };
  }
  const staff = await StaffProfile.findOne({ businessId, staffId: beneficiary }).lean();
  if (!staff) throw new ApiError(404, "Staff member not found");
  const user = await User.findOne({ $or: [{ firebaseUid: staff.staffId }, ...(Types.ObjectId.isValid(staff.staffId) ? [{ _id: staff.staffId }] : [])] }).lean();
  return { business, beneficiary: staff.staffId, aliases: [...new Set([staff.staffId, ...(user ? [String(user._id), user.firebaseUid] : [])])], rate: staff.serviceCommission.value, productRate: staff.productCommission, label: user?.fullName || [staff.firstName, staff.lastName].filter(Boolean).join(" ") || "Staff", independent: false };
}
export type EarningsContext = Awaited<ReturnType<typeof earningsContext>>;
type Mutation = { type: "adjustment" | "payout" | "payout_reversal"; amount?: number; key: string; reason: string; method?: string; reference?: string; reversesId?: string; actorId: Types.ObjectId };

export async function earningsStatement(ctx: EarningsContext, page = 1, mutation?: Mutation) {
  await Promise.all([EarningsAccount.init(), EarningsAccrual.init(), EarningsEntry.init()]);
  // Create before the transaction; the unique account index handles first-read races.
  let account;
  try { account = await EarningsAccount.findOneAndUpdate({ businessId: ctx.business._id, beneficiary: ctx.beneficiary }, { $setOnInsert: { revision: 0 } }, { upsert: true, new: true }); }
  catch (error: any) { if (error?.code !== 11000) throw error; account = await EarningsAccount.findOne({ businessId: ctx.business._id, beneficiary: ctx.beneficiary }); }
  if (!account) throw new ApiError(503, "Earnings are temporarily unavailable");
  const accountId = account._id;
  const session = await mongoose.startSession();
  let result: any;
  try {
    await session.withTransaction(async () => {
      // Serialize reconciliation and payouts for this beneficiary, including concurrent requests.
      await EarningsAccount.updateOne({ _id: accountId }, { $inc: { revision: 1 } }, { session });
      const bookingFilter = { businessId: ctx.business._id, ...(ctx.independent ? {} : { $or: [{ staffId: { $in: ctx.aliases } }, { "staffPlan.staffId": { $in: ctx.aliases } }] }) };
      const previous = await EarningsAccrual.find({ accountId }).session(session).lean();
      const bookings = await Booking.find({ $or: [{ ...bookingFilter, completedAt: { $exists: true }, paymentStatus: "paid" }, { businessId: ctx.business._id, _id: { $in: previous.map(p => p.bookingId) } }] }).populate({ path: "serviceIds", model: Service, select: "basePrice" }).session(session).lean();
      const byId = new Map(bookings.map(b => [String(b._id), b]));
      for (const bookingId of new Set([...bookings.map(b => String(b._id)), ...previous.map(p => String(p.bookingId))])) {
        const booking = byId.get(bookingId);
        const prior = previous.find(p => String(p.bookingId) === bookingId);
        // Booking retention/deletion must not erase an already recorded financial obligation.
        if (prior && !booking) continue;
        const belongs = ctx.independent || !!booking && (ctx.aliases.includes(String(booking.staffId)) || booking.staffPlan?.some(p => ctx.aliases.includes(String(p.staffId))));
        const active = !!booking && belongs && eligibleEarning(booking);
        if (!prior && !active || prior?.active === active) continue;
        const rate = prior?.rate ?? ctx.rate;
        const productRate = prior?.productRate ?? ctx.productRate;
        // Preserve the first earned amount/rate. Subsequent corrections require an audited adjustment.
        const amountMinor = prior?.amountMinor ?? moneyMinor(ctx.independent ? booking!.totalAmount : staffCommission(booking, ctx.aliases, rate, productRate));
        const version = (prior?.version || 0) + 1;
        await EarningsAccrual.updateOne({ accountId, bookingId }, { $set: { amountMinor, rate, productRate, active, version } }, { upsert: true, session });
        await EarningsEntry.create([{ accountId, bookingId, key: `booking:${bookingId}:${version}`, type: active ? "earned" : "reversal", amountMinor: active ? amountMinor : -amountMinor, reason: active ? "Completed appointment paid by customer; commission captured at reconciliation" : "Appointment cancelled, unpaid, or reassigned" }], { session });
      }
      if (mutation) {
        const existing = await EarningsEntry.findOne({ accountId, key: mutation.key }).session(session);
        if (existing) {
          const same = existing.type === mutation.type && existing.reason === mutation.reason && existing.method === mutation.method && existing.reference === mutation.reference && String(existing.reversesId || "") === (mutation.reversesId || "") && (mutation.type === "payout_reversal" || Math.abs(existing.amountMinor) === Math.abs(moneyMinor(mutation.amount!)) && (mutation.type !== "adjustment" || existing.amountMinor === moneyMinor(mutation.amount!)));
          if (!same) throw new ApiError(409, "This request identifier was already used for another entry");
        } else {
          let amountMinor = moneyMinor(mutation.amount || 0);
          if (mutation.type === "payout_reversal") {
            if (!Types.ObjectId.isValid(mutation.reversesId || "")) throw new ApiError(400, "Choose a payout to reverse");
            const payout = await EarningsEntry.findOne({ _id: mutation.reversesId, accountId, type: "payout" }).session(session);
            if (!payout) throw new ApiError(404, "Payout not found");
            if (await EarningsEntry.exists({ accountId, reversesId: payout._id }).session(session)) throw new ApiError(409, "This payout was already reversed");
            amountMinor = -payout.amountMinor;
          } else if (mutation.type === "payout") {
            const totals = await EarningsEntry.aggregate([{ $match: { accountId } }, { $group: { _id: null, balance: { $sum: "$amountMinor" } } }]).session(session);
            if (amountMinor <= 0 || amountMinor > (totals[0]?.balance || 0)) throw new ApiError(409, "Payment exceeds the outstanding balance");
            amountMinor = -amountMinor;
          } else if (!amountMinor) throw new ApiError(400, "Adjustment must not be zero");
          await EarningsEntry.create([{ accountId, ...mutation, amountMinor }], { session });
        }
      }
      const totals = await EarningsEntry.aggregate([{ $match: { accountId } }, { $group: { _id: "$type", amountMinor: { $sum: "$amountMinor" } } }]).session(session);
      const total = await EarningsEntry.countDocuments({ accountId }).session(session);
      const entries = await EarningsEntry.find({ accountId }).sort({ recordedAt: -1, _id: -1 }).skip((page - 1) * 50).limit(50).session(session).lean();
      result = { currency: "ETB", beneficiary: ctx.beneficiary, name: ctx.label, independent: ctx.independent, ...earningsTotals(totals.map(t => ({ type: t._id, amountMinor: t.amountMinor }))), entries: entries.map(e => ({ ...e, amount: e.amountMinor / 100 })), total, page, limit: 50, historicalNote: "Older earnings use the rate available when first recorded. Record prior payments or corrections explicitly; customer payment is not a staff payout." };
    });
  } finally { await session.endSession(); }
  return result;
}
