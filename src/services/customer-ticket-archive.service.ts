import { PipelineStage, Types } from "mongoose";
import Booking from "../models/Booking";
import BookingTicket from "../models/BookingTicket";
import Business from "../models/Business";
import Service from "../models/Service";
import User, { IUser } from "../models/User";
import { ensureTicketRecords } from "./booking-ticket.service";
import { getBookingComputedStatus } from "./bookingStatus.service";

export type ArchiveQuery = { period: "upcoming" | "past" | "all"; page: number; limit: number };

/** Account-owned, durable archive. No local cache or raw QR tokens in list data. */
export async function listCustomerTicketArchive(user: IUser, query: ArchiveQuery, now = new Date()) {
  const { period, page, limit } = query;
  const active = { $and: [
    { $eq: ["$status", "confirmed"] },
    { $eq: [{ $ifNull: ["$completedAt", null] }, null] },
    { $gt: ["$endTime", now] },
  ] };
  const eligible = { $and: [
    { $eq: ["$status", "confirmed"] },
    { $or: [ { $eq: ["$paymentStatus", "paid"] }, { $and: [
      { $ne: ["$business.requirePrepayment", true] }, { $ne: ["$business.type", "independent"] },
    ] } ] },
    { $ne: [{ $ifNull: ["$business._id", null] }, null] },
  ] };
  const items: PipelineStage.FacetPipelineStage[] = [
    ...(period === "all" ? [] : [{ $match: { archivePeriod: period } }]),
    { $sort: { startTime: period === "upcoming" ? 1 : -1, _id: period === "upcoming" ? 1 : -1 } },
    { $skip: (page - 1) * limit }, { $limit: limit },
    { $project: {
      userId: 0, verifyEtResult: 0, paymentScreenshotUrl: 0, appointmentNotes: 0,
      notificationEvents: 0, notificationDispatched: 0,
    } },
  ];
  const results = await Booking.aggregate([
    { $match: { userId: { $in: [...new Set([String(user._id), user.firebaseUid])] } } },
    { $lookup: { from: Business.collection.name, localField: "businessId", foreignField: "_id", pipeline: [{ $project: { name: 1, type: 1, addressString: 1, logoUrl: 1, coverImageUrl: 1, requirePrepayment: 1 } }], as: "business" } },
    { $set: { business: { $first: "$business" } } },
    { $lookup: { from: BookingTicket.collection.name, localField: "_id", foreignField: "bookingId", pipeline: [{ $project: { reference: 1, createdAt: 1 } }], as: "issuedTicket" } },
    { $set: { issuedTicket: { $first: "$issuedTicket" }, canIssue: eligible } },
    { $match: { $or: [{ canIssue: true }, { paymentStatus: "paid" }, { "issuedTicket.reference": { $exists: true } }] } },
    { $set: { archivePeriod: { $cond: [active, "upcoming", "past"] } } },
    { $facet: { counts: [{ $group: { _id: "$archivePeriod", total: { $sum: 1 } } }], items } },
  ]);
  const result = results[0] || { counts: [], items: [] };
  const rows = result.items as Array<Record<string, any>>;
  // Issue existing eligible bookings in a single batch; never mint a new ticket
  // for an unpaid required-prepayment or otherwise unconfirmed booking.
  await ensureTicketRecords(rows.filter(row => row.canIssue && !row.issuedTicket).map(row => row._id as Types.ObjectId));
  const [tickets, services, professionals] = await Promise.all([
    BookingTicket.find({ bookingId: { $in: rows.map(row => row._id) } }).select("bookingId reference createdAt").lean(),
    Service.find({ _id: { $in: rows.flatMap(row => row.serviceIds?.length ? row.serviceIds : row.serviceId ? [row.serviceId] : []) } }).select("name duration basePrice").lean(),
    (() => {
      const ids = rows.flatMap(row => [row.staffId, ...(row.staffPlan || []).map((p: any) => p.staffId)]).map(String);
      return User.find({ $or: [{ _id: { $in: ids.filter(id => /^[a-f0-9]{24}$/i.test(id)) } }, { firebaseUid: { $in: ids } }] }).select("fullName firebaseUid").lean();
    })(),
  ]);
  const ticketMap = new Map(tickets.map(ticket => [String(ticket.bookingId), ticket]));
  const serviceMap = new Map(services.map(service => [String(service._id), service]));
  const professionalMap = new Map(professionals.flatMap(person => [[String(person._id), person.fullName], [person.firebaseUid, person.fullName]] as Array<[string,string]>));
  const counts = { upcoming: 0, past: 0, all: 0 };
  for (const count of result.counts) if (count._id === "upcoming" || count._id === "past") counts[count._id as "upcoming" | "past"] = count.total;
  counts.all = counts.upcoming + counts.past;
  const total = counts[period];
  return {
    items: rows.map(row => {
      const id = String(row._id), ticket = ticketMap.get(id), business = row.business;
      const serviceIds = row.serviceIds?.length ? row.serviceIds : row.serviceId ? [row.serviceId] : [];
      const paid = row.paymentStatus === "paid";
      const canViewTicket = Boolean(ticket && business);
      return {
        id, bookingId: id, period: row.archivePeriod,
        reference: ticket?.reference || null, ticketIssuedAt: ticket?.createdAt || null,
        shopId: String(row.businessId), businessName: business?.name || "Business unavailable", shopName: business?.name || "Business unavailable",
        shopType: business?.type || null, shopAddress: business?.addressString || "", logoUrl: business?.logoUrl || "", coverImageUrl: business?.coverImageUrl || "",
        services: serviceIds.map((value: unknown) => {
          const service = serviceMap.get(String(value));
          return { id: String(value), name: service?.name || "Service", duration: service?.duration || 0,
            amount: row.servicePriceSnapshots?.find((s: any) => String(s.serviceId) === String(value))?.unitPrice ?? service?.basePrice ?? null };
        }),
        professionals: [...new Set([row.staffId, ...(row.staffPlan || []).map((p: any) => p.staffId)].map(value => professionalMap.get(String(value))).filter(Boolean))],
        startTime: row.startTime, endTime: row.endTime, completedAt: row.completedAt || null,
        bookingStatus: row.status, computedStatus: getBookingComputedStatus(row as any, now),
        amount: row.totalAmount, currency: "ETB", paymentMethod: row.paymentMethod, paymentStatus: row.paymentStatus,
        paymentVerificationStatus: row.paymentVerificationStatus || "none", paidAt: row.paidAt || null,
        canViewTicket, ticketValid: Boolean(ticket && row.canIssue), canViewReceipt: Boolean(paid && business),
        receiptReference: paid ? `ELV-R-${id.toUpperCase()}` : null,
        ticketPath: canViewTicket ? `/bookings/${id}/ticket` : null,
        receiptPath: paid && business ? `/bookings/${id}/receipt` : null,
      };
    }),
    counts, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total },
    serverTime: now.toISOString(),
  };
}
