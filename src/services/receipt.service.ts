import { Types } from "mongoose";
import Booking from "../models/Booking";

export const listReceiptsForUser = async (userId: Types.ObjectId | string, firebaseUid?: string) => {
  const bookings = await Booking.find({
    userId: { $in: [String(userId), ...(firebaseUid ? [firebaseUid] : [])] },
    paymentStatus: "paid",
  })
    .sort({ paidAt: -1, startTime: -1 })
    .populate(
      "businessId",
      "name type addressString logoUrl coverImageUrl",
    )
    .populate("serviceIds", "name duration basePrice")
    .populate("serviceId", "name duration basePrice")
    .lean();

  return bookings.map((booking) => {
    const business = booking.businessId as unknown as
      | {
          _id?: unknown;
          name?: string;
          type?: string;
          addressString?: string;
          logoUrl?: string;
          coverImageUrl?: string;
        }
      | null;
    const services = Array.isArray(booking.serviceIds)
      ? booking.serviceIds
      : booking.serviceId
        ? [booking.serviceId]
        : [];

    return {
      id: String(booking._id),
      bookingId: String(booking._id),
      shopName: business?.name || "Shop",
      shopId: business?._id ? String(business._id) : String(booking.businessId),
      shopType: business?.type || "shop",
      shopAddress: business?.addressString || "",
      logoUrl: business?.logoUrl || "",
      coverImageUrl: business?.coverImageUrl || "",
      amount: Number(booking.totalAmount || 0),
      currency: "ETB",
      paymentMethod: booking.paymentMethod,
      paymentStatus: booking.paymentStatus,
      paymentVerificationStatus: booking.paymentVerificationStatus || "none",
      paidAt: booking.paidAt || null,
      startTime: booking.startTime,
      status: booking.status,
      paymentScreenshotUrl: booking.paymentScreenshotUrl || null,
      services: services.map((service) => {
        const row = service as {
          _id?: unknown;
          name?: string;
          duration?: number;
          basePrice?: number;
        };
        return {
          id: row._id ? String(row._id) : "",
          name: row.name || "Service",
          duration: Number(row.duration || 0),
          basePrice: Number(row.basePrice || 0),
        };
      }),
    };
  });
};
