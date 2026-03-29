import { bookingOfflineVersion } from '../utils/website-offline-version';
import { Types } from "mongoose";
import { earningsContext, earningsStatement } from "./earnings.service";
import Absence, { IAbsence } from "../models/Absence";
import Availability, { IAvailability } from "../models/Availability";
import Booking, { IBooking } from "../models/Booking";
import Business from "../models/Business";
import Client, { IClient } from "../models/Client";
import Product, { IProduct } from "../models/Product";
import Service, { IService } from "../models/Service";
import StaffProfile, { IStaffProfile } from "../models/StaffProfile";
import StaffService from "../models/StaffService";
import User from "../models/User";
import { getNotificationQueue } from "../jobs/queue";
import ApiError from "../utils/ApiError";
import { getBookingComputedStatus } from "./bookingStatus.service";
import { delCachedKey } from "./cache.service";
import { toPublicUrl } from "./media.service";
import { findUserByFirebaseUid } from "./user.service";

// ─── Helpers ─────────────────────────────────────────────────

const startOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const dateToMinutes = (date: Date): number =>
  date.getHours() * 60 + date.getMinutes();

const assertWithinBusinessHours = (
  business: { openingTime?: string; closingTime?: string },
  startTime: string,
  endTime: string,
) => {
  const opening = toMinutes(business.openingTime || "09:00");
  const closing = toMinutes(business.closingTime || "18:00");
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  if (start < opening || end > closing || start >= end) {
    throw new ApiError(400, "Staff working hours must fall within business hours");
  }
};

const assertAbsenceWithinBusinessHours = (
  business: { openingTime?: string; closingTime?: string },
  startTime: Date,
  endTime: Date,
) => {
  if (startOfDay(startTime).getTime() !== startOfDay(endTime).getTime()) {
    throw new ApiError(400, "Staff working hours must fall within business hours");
  }

  const opening = toMinutes(business.openingTime || "09:00");
  const closing = toMinutes(business.closingTime || "18:00");
  const start = dateToMinutes(startTime);
  const end = dateToMinutes(endTime);

  if (start < opening || end > closing || start >= end) {
    throw new ApiError(400, "Staff working hours must fall within business hours");
  }
};

const resolveProfilePicture = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  return toPublicUrl(value);
};

const dateRangeBounds = (
  range: "day" | "week" | "month",
  refDate: Date,
): { from: Date; to: Date } => {
  const to = endOfDay(refDate);
  const from = startOfDay(refDate);
  if (range === "week") from.setDate(from.getDate() - 6);
  if (range === "month") from.setDate(from.getDate() - 29);
  return { from, to };
};

// ─── Dashboard Summary ───────────────────────────────────────

export const getDashboardSummary = async (
  businessId: string,
): Promise<{
  todayBookings: number;
  confirmed: number;
  completed: number;
  noShow: number;
  cancelled: number;
  revenue: number;
}> => {
  const today = new Date();
  const dayStart = startOfDay(today);
  const dayEnd = endOfDay(today);

  const bookings = await Booking.find({
    businessId,
    startTime: { $gte: dayStart, $lte: dayEnd },
  })
    .populate("serviceIds", "basePrice")
    .populate("serviceId", "basePrice")
    .lean();

  let confirmed = 0;
  let completed = 0;
  let noShow = 0;
  let cancelled = 0;
  let revenue = 0;

  for (const b of bookings) {
    const computedStatus = getBookingComputedStatus(b);

    if (computedStatus === "upcoming" || computedStatus === "in-progress") {
      confirmed++;
    } else if (computedStatus === "completed") {
      completed++;
      const services = Array.isArray(b.serviceIds)
        ? (b.serviceIds as Array<{ basePrice?: number }>)
        : [];

      if (services.length > 0) {
        revenue += services.reduce(
          (sum, svc) => sum + (svc?.basePrice ?? 0),
          0,
        );
      } else {
        const svc = b.serviceId as unknown as { basePrice?: number };
        revenue += svc?.basePrice ?? 0;
      }
    } else if (computedStatus === "no-show") {
      noShow++;
    } else if (computedStatus === "cancelled") {
      cancelled++;
    }
  }

  return {
    todayBookings: bookings.length,
    confirmed,
    completed,
    noShow,
    cancelled,
    revenue,
  };
};

// ─── Bookings ────────────────────────────────────────────────

export type BookingSummary = {
  _id: string;
  startTime: Date;
  endTime: Date;
  staffId?: {
    _id: string;
    userId?: {
      fullName?: string;
      profilePicture?: string;
    };
  };
  clientId?: {
    _id: string;
    fullName?: string;
    phoneNumber?: string;
  };
  serviceIds: Array<{
    _id?: string;
    name?: string;
    duration?: number;
    basePrice?: number;
    category?: string;
    categoryName?: string;
  }>;
  status?: string;
  computedStatus: string;
  paymentStatus?: string;
  paymentMethod?: string;
  paymentVerificationStatus?: string;
  paymentScreenshotUrl?: string;
  totalAmount?: number;
  isWalkIn?: boolean;
};

export const listBusinessBookings = async ({
  businessId,
  date,
  status,
  staffId,
  page,
  limit,
}: {
  businessId: string;
  date?: Date;
  status?: string;
  staffId?: string;
  page: number;
  limit: number;
}): Promise<{
  bookings: BookingSummary[];
  total: number;
  page: number;
  totalPages: number;
}> => {
  const filter: Record<string, unknown> = { businessId };
  const normalizedStatus = status === "no_show" ? "no-show" : status;

  if (date) {
    filter.startTime = { $gte: startOfDay(date), $lte: endOfDay(date) };
  }
  if (normalizedStatus === "no-show") {
    filter.status = { $in: ["no-show", "no_show"] };
  } else if (["cancelled", "pending", "expired"].includes(normalizedStatus || "")) {
    filter.status = normalizedStatus;
  } else if (normalizedStatus) {
    filter.status = { $in: ["confirmed", "completed"] };
  }
  if (staffId) filter.staffId = staffId;

  const bookings = await Booking.find(filter)
    .sort({ startTime: 1, _id: 1 })
    .populate("userId", "fullName phoneNumber")
    .populate("clientId", "fullName phoneNumber email notes")
    .populate("serviceIds", "name duration basePrice category categoryName")
    .populate("serviceId", "name duration basePrice category categoryName")
    .lean();

  const bookingStaffIds = [
    ...new Set(
      bookings
        .map((booking) => String((booking as any).staffId || ""))
        .filter(Boolean),
    ),
  ];

  const objectIdStaffIds = bookingStaffIds.filter((value) =>
    Types.ObjectId.isValid(value),
  );

  const staffProfiles = bookingStaffIds.length
    ? await StaffProfile.find({
        staffId: { $in: bookingStaffIds },
        businessId,
        isActive: true,
      }).lean()
    : [];

  const staffUsers = bookingStaffIds.length
    ? await User.find({
        $or: [
          { firebaseUid: { $in: bookingStaffIds } },
          ...(objectIdStaffIds.length
            ? [{ _id: { $in: objectIdStaffIds.map((id) => new Types.ObjectId(id)) } }]
            : []),
        ],
      })
        .select("firebaseUid fullName profilePicture")
        .lean()
    : [];

  const userByStaffKey = new Map<
    string,
    { fullName?: string; profilePicture?: string }
  >();
  for (const user of staffUsers as Array<{
    _id: Types.ObjectId;
    firebaseUid?: string;
    fullName?: string;
    profilePicture?: string;
  }>) {
    const snapshot = {
      fullName: user.fullName,
      profilePicture: resolveProfilePicture(user.profilePicture),
    };
    userByStaffKey.set(String(user._id), snapshot);
    if (user.firebaseUid) {
      userByStaffKey.set(String(user.firebaseUid), snapshot);
    }
  }

  for (const profile of staffProfiles) {
    const current = userByStaffKey.get(String(profile.staffId));
    if (current) {
      userByStaffKey.set(String(profile.staffId), current);
    }
  }

  const now = new Date();
  const withComputed: BookingSummary[] = bookings
    .map((booking) => {
      const computedStatus = getBookingComputedStatus(booking, now);
      const rawStaffId = String((booking as any).staffId || "");
      const staffUser = userByStaffKey.get(rawStaffId);

      const client =
        (booking as any).clientId && typeof (booking as any).clientId === "object"
          ? {
              _id: String((booking as any).clientId._id),
              fullName: (booking as any).clientId.fullName,
              phoneNumber: (booking as any).clientId.phoneNumber,
              profilePicture: resolveProfilePicture(
                (booking as any).clientId.profilePicture,
              ),
            }
          : (booking as any).userId
            ? {
                _id: String((booking as any).userId._id || (booking as any).userId),
                fullName: (booking as any).userId.fullName,
                phoneNumber: (booking as any).userId.phoneNumber,
                profilePicture: resolveProfilePicture(
                  (booking as any).userId.profilePicture,
                ),
              }
            : undefined;

      const servicesArr: Array<{
        _id?: string;
        name?: string;
        duration?: number;
        basePrice?: number;
        category?: string;
        categoryName?: string;
      }> = Array.isArray(booking.serviceIds)
        ? (booking.serviceIds as any[]).map((s) => ({
            _id: String(s._id),
            name: s.name,
            duration: s.duration,
            basePrice: s.basePrice,
            category: s.category,
            categoryName: s.categoryName,
          }))
        : booking.serviceId
          ? [
              {
                _id: String((booking.serviceId as any)._id),
                name: (booking.serviceId as any).name,
                duration: (booking.serviceId as any).duration,
                basePrice: (booking.serviceId as any).basePrice,
                category: (booking.serviceId as any).category,
                categoryName: (booking.serviceId as any).categoryName,
              },
            ]
          : [];

      return {
        _id: String((booking as any)._id),
        offlineVersion: bookingOfflineVersion(booking),
        updatedAt: (booking as any).updatedAt,
        businessId: String((booking as any).businessId),
        startTime: (booking as any).startTime,
        endTime: (booking as any).endTime,
        staffId: rawStaffId
          ? {
              _id: rawStaffId,
              userId: staffUser,
            }
          : undefined,
        clientId: client,
        serviceIds: servicesArr,
        status: (booking as any).status,
        computedStatus,
        completedAt: (booking as any).completedAt,
        paymentStatus: (booking as any).paymentStatus,
        paymentMethod: (booking as any).paymentMethod,
        paymentVerificationStatus:
          (booking as any).paymentVerificationStatus || "none",
        paymentScreenshotUrl: (booking as any).paymentScreenshotUrl,
        totalAmount: Number((booking as any).totalAmount || 0),
        isWalkIn: Boolean((booking as any).isWalkIn),
      };
    })
    .filter((booking) => {
      if (!normalizedStatus) return true;
      if (normalizedStatus === "confirmed") {
        return booking.computedStatus === "upcoming" || booking.computedStatus === "in-progress";
      }
      return booking.computedStatus === normalizedStatus;
    });

  const total = withComputed.length;
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const skip = (page - 1) * limit;
  const pagedBookings = withComputed.slice(skip, skip + limit);

  return { bookings: pagedBookings, total, page, totalPages };
};

export const cancelBusinessBooking = async (
  bookingId: string,
  businessId: string,
  cancelledById: Types.ObjectId,
  reason?: string,
): Promise<IBooking> => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");
  if (String(booking.businessId) !== businessId)
    throw new ApiError(403, "Booking does not belong to this business");
  if (booking.status === "cancelled" || booking.status === "no-show")
    throw new ApiError(
      400,
      `Cannot cancel a booking with status '${booking.status}'`,
    );

  booking.status = "cancelled";
  booking.cancelledBy = cancelledById;
  booking.cancelledAt = new Date();
  booking.cancellationReason = reason || "";
  await booking.save();

  const notifyQueue = getNotificationQueue();
  await notifyQueue.add("booking-cancelled", {
    userId: String(booking.userId),
    payload: {
      notification: {
        title: "Booking cancelled",
        body: "Your booking has been cancelled by the shop.",
      },
      data: { bookingId: String(booking._id), type: "booking_cancelled" },
    },
  });

  return booking;
};

// ─── Staff ───────────────────────────────────────────────────

export const createDashboardStaff = async ({
  ownerId,
  businessId,
  staffId,
  fullName,
  email,
  phoneNumber,
  specialties,
  services,
  role,
  permissionLevel,
  hourlyWage,
  serviceCommission,
  productCommission,
  biography,
  isBookableInCalendar,
  overrides,
}: {
  ownerId: string;
  businessId: string;
  staffId?: string;
  fullName?: string;
  email?: string;
  phoneNumber?: string;
  specialties?: string[];
  services?: string[];
  role?: string;
  permissionLevel?: "low" | "medium" | "high";
  hourlyWage?: number;
  serviceCommission?: { type: "fixed" | "tiered"; value: number };
  productCommission?: number;
  biography?: string;
  isBookableInCalendar?: boolean;
  overrides?: Array<{ serviceId: string; price: number }>;
}): Promise<IStaffProfile> => {
  let resolvedStaffId = staffId?.trim() || "";
  let user = resolvedStaffId
    ? await findUserByFirebaseUid(resolvedStaffId)
    : null;

  const business = await Business.findById(businessId);
  if (!business) throw new ApiError(404, "Business not found");
  if (business.type !== "shop") {
    throw new ApiError(403, "Independent professionals cannot add additional staff");
  }

  if (!user && fullName?.trim() && email?.trim()) {
    const slug = email
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    resolvedStaffId = resolvedStaffId || `staff-${slug}-${Date.now()}`;
    user = await User.findOneAndUpdate(
      { email: email.trim().toLowerCase() },
      {
        firebaseUid: resolvedStaffId,
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phoneNumber: phoneNumber?.trim(),
        roles: ["staff"],
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  if (!user) throw new ApiError(404, "Staff user not found");
  if (!resolvedStaffId) resolvedStaffId = user.firebaseUid;

  if (!user.roles.includes("staff")) {
    user.roles.push("staff");
    await user.save();
  }

  let resolvedServices = (services || [])
    .filter(Boolean)
    .map((id) => new Types.ObjectId(id));

  if (resolvedServices.length === 0) {
    const businessServices = await Service.find({ businessId })
      .select("_id")
      .lean();
    resolvedServices = businessServices.map(
      (row) => row._id as Types.ObjectId,
    );
  }

  const profile = await StaffProfile.findOneAndUpdate(
    { staffId: resolvedStaffId, businessId },
    {
      staffId: resolvedStaffId,
      businessId,
      services: resolvedServices,
      specialties: specialties || [],
      isActive: true,
      firstName: fullName?.split(" ")[0] || "",
      lastName: fullName?.split(" ").slice(1).join(" ") || "",
      email: email?.trim().toLowerCase() || "",
      role: role || "",
      permissionLevel: permissionLevel || "low",
      hourlyWage: hourlyWage || 0,
      serviceCommission: serviceCommission || { type: "fixed", value: 0 },
      productCommission: productCommission || 0,
      biography: biography || "",
      isBookableInCalendar: isBookableInCalendar !== false,
    },
    { new: true, upsert: true },
  );

  if (overrides && overrides.length > 0) {
    await Promise.all(
      overrides.map((item) =>
        StaffService.findOneAndUpdate(
          { staffId: profile._id, serviceId: item.serviceId },
          { price: item.price },
          { upsert: true, new: true },
        ),
      ),
    );
  }

  // Auto-seed availability for Monday to Saturday
  if (business.openingTime && business.closingTime) {
    for (let day = 1; day <= 6; day++) {
      await Availability.findOneAndUpdate(
        { staffId: resolvedStaffId, dayOfWeek: day },
        {
          staffId: resolvedStaffId,
          dayOfWeek: day,
          startTime: business.openingTime,
          endTime: business.closingTime,
        },
        { new: true, upsert: true }
      );
    }
  }

  // Mock sending onboarding email
  if (email) {
    console.log(`[Mock] Sending onboarding email to ${email} for staff invite.`);
  }

  return profile;
};

export const updateDashboardStaff = async (
  staffId: string,
  businessId: string,
  updates: {
    specialties?: string[];
    services?: string[];
    isActive?: boolean;
    isOnlineVisible?: boolean;
    role?: string;
    permissionLevel?: "low" | "medium" | "high";
    hourlyWage?: number;
    serviceCommission?: { type: "fixed" | "tiered"; value: number };
    productCommission?: number;
    biography?: string;
    isBookableInCalendar?: boolean;
  },
): Promise<IStaffProfile> => {
  const profile = await StaffProfile.findOne({ staffId });
  if (!profile) throw new ApiError(404, "Staff profile not found");
  if (String(profile.businessId) !== businessId)
    throw new ApiError(403, "Staff does not belong to this business");

  if (updates.specialties !== undefined)
    profile.specialties = updates.specialties;
  if (updates.services !== undefined)
    profile.services = updates.services.map((s) => new Types.ObjectId(s));
  if (updates.isActive !== undefined) profile.isActive = updates.isActive;
  if (updates.isOnlineVisible !== undefined) {
    profile.isOnlineVisible = updates.isOnlineVisible;
  }
  if (updates.role !== undefined) profile.role = updates.role;
  if (updates.permissionLevel !== undefined) profile.permissionLevel = updates.permissionLevel;
  if (updates.hourlyWage !== undefined) profile.hourlyWage = updates.hourlyWage;
  if (updates.serviceCommission !== undefined || updates.productCommission !== undefined) {
    // Capture completed/paid work at the old rate before changing future earnings.
    await earningsStatement(await earningsContext(businessId, staffId));
    if (updates.serviceCommission !== undefined) profile.serviceCommission = updates.serviceCommission;
  }
  if (updates.productCommission !== undefined) profile.productCommission = updates.productCommission;
  if (updates.biography !== undefined) profile.biography = updates.biography;
  if (updates.isBookableInCalendar !== undefined) profile.isBookableInCalendar = updates.isBookableInCalendar;

  await profile.save();
  return profile;
};

export const archiveDashboardStaff = async (
  staffId: string,
  businessId: string,
): Promise<IStaffProfile> => {
  return updateDashboardStaff(staffId, businessId, { isActive: false });
};

// ─── Availability ────────────────────────────────────────────

export const setStaffAvailability = async (
  staffId: string,
  businessId: string,
  data: { dayOfWeek: number; startTime: string; endTime: string },
): Promise<IAvailability> => {
  const [availability] = await setStaffAvailabilityBatch(staffId, businessId, [
    data,
  ]);
  return availability;
};

export const setStaffAvailabilityBatch = async (
  staffId: string,
  businessId: string,
  entries: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
): Promise<IAvailability[]> => {
  const staff = await StaffProfile.findOne({ staffId });
  if (!staff) throw new ApiError(404, "Staff profile not found");
  if (String(staff.businessId) !== businessId)
    throw new ApiError(403, "Staff does not belong to this business");

  const business = await Business.findById(businessId).select("openingTime closingTime");
  if (!business) throw new ApiError(404, "Business not found");

  const saved: IAvailability[] = [];
  for (const entry of entries) {
    assertWithinBusinessHours(business, entry.startTime, entry.endTime);
    const availability = await Availability.findOneAndUpdate(
      {
        staffId,
        dayOfWeek: entry.dayOfWeek,
        startTime: entry.startTime,
        endTime: entry.endTime,
      },
      {
        staffId,
        dayOfWeek: entry.dayOfWeek,
        startTime: entry.startTime,
        endTime: entry.endTime,
      },
      { new: true, upsert: true },
    );
    saved.push(availability);
  }

  return saved;
};

export const getStaffAvailability = async (
  staffId: string,
  businessId: string,
): Promise<IAvailability[]> => {
  const staff = await StaffProfile.findOne({ staffId });
  if (!staff) throw new ApiError(404, "Staff profile not found");
  if (String(staff.businessId) !== businessId)
    throw new ApiError(403, "Staff does not belong to this business");

  return Availability.find({ staffId })
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();
};

// ─── Absences ────────────────────────────────────────────────

export const createStaffAbsence = async (
  staffId: string,
  businessId: string,
  data: { startTime: Date; endTime: Date; reason?: string },
): Promise<IAbsence> => {
  const staff = await StaffProfile.findOne({ staffId });
  if (!staff) throw new ApiError(404, "Staff profile not found");
  if (String(staff.businessId) !== businessId)
    throw new ApiError(403, "Staff does not belong to this business");

  const business = await Business.findById(businessId).select("openingTime closingTime");
  if (!business) throw new ApiError(404, "Business not found");
  assertAbsenceWithinBusinessHours(business, data.startTime, data.endTime);

  return Absence.create({
    staffId,
    businessId,
    startTime: data.startTime,
    endTime: data.endTime,
    reason: data.reason,
  });
};

export const listStaffAbsences = async (
  staffId: string,
  businessId: string,
  from?: Date,
  to?: Date,
): Promise<IAbsence[]> => {
  const staff = await StaffProfile.findOne({ staffId });
  if (!staff) throw new ApiError(404, "Staff profile not found");
  if (String(staff.businessId) !== businessId)
    throw new ApiError(403, "Staff does not belong to this business");

  const filter: Record<string, unknown> = { staffId };
  if (from || to) {
    filter.startTime = {};
    if (from) (filter.startTime as Record<string, unknown>).$gte = from;
    if (to) (filter.startTime as Record<string, unknown>).$lte = to;
  }

  return Absence.find(filter).sort({ startTime: 1 }).lean();
};

export const deleteStaffAbsence = async (
  absenceId: string,
  staffId: string,
  businessId: string,
): Promise<void> => {
  const absence = await Absence.findById(absenceId);
  if (!absence) throw new ApiError(404, "Absence not found");
  if (
    String(absence.staffId) !== staffId ||
    String(absence.businessId) !== businessId
  )
    throw new ApiError(403, "Absence does not belong to this staff/business");

  await absence.deleteOne();
};

// ─── Services ────────────────────────────────────────────────

export const updateBusinessService = async (
  serviceId: string,
  businessId: string,
  updates: { name?: string; categoryName?: string; duration?: number; basePrice?: number },
): Promise<IService> => {
  const service = await Service.findById(serviceId);
  if (!service) throw new ApiError(404, "Service not found");
  if (String(service.businessId) !== businessId)
    throw new ApiError(403, "Service does not belong to this business");

  if (updates.name !== undefined) service.name = updates.name;
  if (updates.categoryName !== undefined) {
    service.categoryName = updates.categoryName.trim().replace(/\s+/g, ' ');
    service.category = service.categoryName;
  }
  if (updates.duration !== undefined) service.duration = updates.duration;
  if (updates.basePrice !== undefined) service.basePrice = updates.basePrice;

  await service.save();
  await delCachedKey(`business:${businessId}:services`);
  return service;
};

export const deleteBusinessService = async (
  serviceId: string,
  businessId: string,
): Promise<void> => {
  const service = await Service.findById(serviceId);
  if (!service) throw new ApiError(404, "Service not found");
  if (String(service.businessId) !== businessId)
    throw new ApiError(403, "Service does not belong to this business");

  const futureBooking = await Booking.findOne({
    serviceId,
    status: "confirmed",
    startTime: { $gt: new Date() },
  });
  if (futureBooking)
    throw new ApiError(
      400,
      "Cannot delete a service with future confirmed bookings. Cancel them first.",
    );

  await StaffProfile.updateMany(
    { businessId },
    { $pull: { services: new Types.ObjectId(serviceId) } },
  );
  await StaffService.deleteMany({ serviceId });
  await service.deleteOne();
  await delCachedKey(`business:${businessId}:services`);
};

// ─── Customers ───────────────────────────────────────────────

export const listBusinessCustomers = async (
  businessId: string,
): Promise<
  Array<{
    _id: string;
    fullName: string;
    phoneNumber: string;
    totalBookings: number;
    completedBookings: number;
    noShowCount: number;
    lastVisit: Date | null;
  }>
> => {
  const businessObjectId = new Types.ObjectId(businessId);

  const results = await Booking.aggregate([
    { $match: { businessId: businessObjectId } },
    {
      $group: {
        _id: "$userId",
        totalBookings: { $sum: 1 },
        completedBookings: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", "confirmed"] },
                  { $lte: ["$endTime", new Date()] },
                ],
              },
              1,
              0,
            ],
          },
        },
        noShowCount: {
          $sum: { $cond: [{ $eq: ["$status", "no-show"] }, 1, 0] },
        },
        lastVisit: { $max: "$startTime" },
      },
    },
    {
      $lookup: {
        from: "users",
        let: { userKey: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: [{ $toString: "$_id" }, "$$userKey"] },
            },
          },
        ],
        as: "user",
      },
    },
    {
      $lookup: {
        from: "clients",
        let: { userKey: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$businessId", businessObjectId] },
                  { $eq: [{ $toString: "$_id" }, "$$userKey"] },
                ],
              },
            },
          },
        ],
        as: "client",
      },
    },
    {
      $match: {
        $or: [{ "user.0": { $exists: true } }, { "client.0": { $exists: true } }],
      },
    },
    {
      $project: {
        _id: 1,
        fullName: {
          $ifNull: [
            { $arrayElemAt: ["$user.fullName", 0] },
            { $arrayElemAt: ["$client.fullName", 0] },
          ],
        },
        phoneNumber: {
          $ifNull: [
            { $arrayElemAt: ["$user.phoneNumber", 0] },
            { $arrayElemAt: ["$client.phoneNumber", 0] },
          ],
        },
        totalBookings: 1,
        completedBookings: 1,
        noShowCount: 1,
        lastVisit: 1,
      },
    },
    { $sort: { totalBookings: -1 } },
  ]);

  return results;
};

// ─── Revenue ─────────────────────────────────────────────────

export const getBusinessRevenue = async (
  businessId: string,
  range: "day" | "week" | "month",
  refDate?: Date,
): Promise<{
  total: number;
  cash: number;
  bankTransfer: number;
  completedBookings: number;
  range: string;
  from: Date;
  to: Date;
}> => {
  const { from, to } = dateRangeBounds(range, refDate || new Date());

  const bookings = await Booking.find({
    businessId,
    paymentStatus: "paid",
    endTime: { $gte: from, $lte: to },
  })
    .populate("serviceIds", "basePrice")
    .populate("serviceId", "basePrice")
    .lean();

  let total = 0;
  let cash = 0;
  let bankTransfer = 0;
  for (const b of bookings) {
    const bookingTotal = Number((b as { totalAmount?: number }).totalAmount || 0);
    const services = Array.isArray(b.serviceIds)
      ? (b.serviceIds as Array<{ basePrice?: number }>)
      : [];

    const paymentMethod = String((b as { paymentMethod?: string }).paymentMethod || "in-shop");
    if (services.length > 0) {
      total += bookingTotal || services.reduce((sum, svc) => sum + (svc?.basePrice ?? 0), 0);
    } else {
      const svc = b.serviceId as unknown as { basePrice?: number };
      total += bookingTotal || (svc?.basePrice ?? 0);
    }

    if (paymentMethod === "cash") {
      cash += bookingTotal || 0;
    } else {
      bankTransfer += bookingTotal || 0;
    }
  }

  return {
    total,
    cash,
    bankTransfer,
    completedBookings: bookings.length,
    range,
    from,
    to,
  };
};

export type EodTransaction = {
  id: string;
  clientName: string;
  staffName: string;
  services: string;
  amount: number;
  paymentMethod: string;
  isWalkIn: boolean;
  startTime: Date;
};

export type EndOfDayReport = {
  date: string;
  shopName: string;
  cashTotal: number;
  bankTransferTotal: number;
  platformTotal: number;
  platformCount: number;
  walkInTotal: number;
  walkInCount: number;
  grandTotal: number;
  paidBookingsCount: number;
  transactions: EodTransaction[];
};

/** EOD: paid bookings only. Platform = not walk-in. */
export const getEndOfDayReport = async (
  businessId: string,
  refDate: Date,
): Promise<EndOfDayReport> => {
  const business = await Business.findById(businessId).lean();
  if (!business) throw new ApiError(404, "Business not found");

  const dayStart = startOfDay(refDate);
  const dayEnd = endOfDay(refDate);

  const bookings = await Booking.find({
    businessId,
    paymentStatus: "paid",
    startTime: { $gte: dayStart, $lte: dayEnd },
  })
    .populate("clientId", "fullName")
    .populate("serviceIds", "name")
    .populate("serviceId", "name")
    .lean();

  const staffIds = [
    ...new Set(bookings.map((b) => String(b.staffId || "")).filter(Boolean)),
  ];
  const staffUsers = staffIds.length
    ? await User.find({ firebaseUid: { $in: staffIds } })
        .select("firebaseUid fullName")
        .lean()
    : [];
  const staffNameById = new Map(
    staffUsers.map((u) => [String(u.firebaseUid), u.fullName || "Staff"]),
  );

  let cashTotal = 0;
  let bankTransferTotal = 0;
  let platformTotal = 0;
  let platformCount = 0;
  let walkInTotal = 0;
  let walkInCount = 0;

  const transactions: EodTransaction[] = bookings.map((b) => {
    const amount = Number((b as { totalAmount?: number }).totalAmount || 0);
    const paymentMethod = String(b.paymentMethod || "in-shop");
    const isWalkIn = Boolean(b.isWalkIn);

    if (paymentMethod === "cash") {
      cashTotal += amount;
    } else if (
      paymentMethod === "in-shop" ||
      paymentMethod === "cbe" ||
      paymentMethod === "cbe_birr" ||
      paymentMethod === "telebirr" ||
      paymentMethod === "online_other"
    ) {
      bankTransferTotal += amount;
    } else {
      bankTransferTotal += amount;
    }

    if (isWalkIn) {
      walkInTotal += amount;
      walkInCount += 1;
    } else {
      platformTotal += amount;
      platformCount += 1;
    }

    const serviceNames = Array.isArray(b.serviceIds)
      ? (b.serviceIds as Array<{ name?: string }>)
          .map((s) => s.name)
          .filter(Boolean)
          .join(", ")
      : (b.serviceId as { name?: string } | undefined)?.name || "Service";

    const client =
      b.clientId && typeof b.clientId === "object"
        ? (b.clientId as { fullName?: string }).fullName
        : undefined;

    return {
      id: String(b._id),
      clientName: client || (isWalkIn ? "Walk-in" : "Customer"),
      staffName: staffNameById.get(String(b.staffId)) || "Staff",
      services: serviceNames,
      amount,
      paymentMethod,
      isWalkIn,
      startTime: b.startTime,
    };
  });

  transactions.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  const dateStr = refDate.toISOString().slice(0, 10);

  return {
    date: dateStr,
    shopName: String((business as { name?: string }).name || "Shop"),
    cashTotal,
    bankTransferTotal,
    platformTotal,
    platformCount,
    walkInTotal,
    walkInCount,
    grandTotal: cashTotal + bankTransferTotal,
    paidBookingsCount: bookings.length,
    transactions,
  };
};

export type BusinessAnalytics = {
  range: "day" | "week" | "month";
  from: string;
  to: string;
  revenue: {
    total: number;
    cash: number;
    bankTransfer: number;
    previousPeriodTotal: number;
    changePercent: number;
  };
  bookings: {
    total: number;
    paid: number;
    walkIn: number;
    platform: number;
    cancelled: number;
    noShow: number;
    averageTicket: number;
  };
  staffPerformance: Array<{
    staffId: string;
    name: string;
    role: string;
    avatarUrl: string;
    bookings: number;
    revenue: number;
    /** Relative performance score for the period (not a customer review rating). */
    performanceScore: number;
  }>;
  topServices: Array<{ name: string; count: number; revenue: number }>;
  peakHours: Array<{ hour: number; count: number }>;
  recentBookings: Array<{
    id: string;
    customerName: string;
    serviceName: string;
    bookingDate: string;
    staffName: string;
    status: string;
  }>;
};

export const getBusinessAnalytics = async (
  businessId: string,
  range: "day" | "week" | "month",
  refDate?: Date,
): Promise<BusinessAnalytics> => {
  const ref = refDate || new Date();
  const { from, to } = dateRangeBounds(range, ref);

  const prevRef = new Date(from);
  if (range === "day") prevRef.setDate(prevRef.getDate() - 1);
  else if (range === "week") prevRef.setDate(prevRef.getDate() - 7);
  else prevRef.setDate(prevRef.getDate() - 30);
  const prevBounds = dateRangeBounds(range, prevRef);

  const [bookings, prevPaidBookings] = await Promise.all([
    Booking.find({ businessId, startTime: { $gte: from, $lte: to } })
      .populate("serviceIds", "name basePrice")
      .populate("serviceId", "name basePrice")
      .populate("clientId", "fullName")
      .lean(),
    Booking.find({
      businessId,
      paymentStatus: "paid",
      startTime: { $gte: prevBounds.from, $lte: prevBounds.to },
    }).lean(),
  ]);

  let cash = 0;
  let bankTransfer = 0;
  let paid = 0;
  let walkIn = 0;
  let platform = 0;
  let cancelled = 0;
  let noShow = 0;
  let paidRevenue = 0;

  const staffStats = new Map<string, { bookings: number; revenue: number }>();
  const serviceStats = new Map<string, { count: number; revenue: number }>();
  const hourCounts = new Map<number, number>();

  for (const b of bookings) {
    const computed = getBookingComputedStatus(b);
    if (computed === "cancelled") cancelled += 1;
    if (computed === "no-show") noShow += 1;

    const isWalkIn = Boolean(b.isWalkIn);
    if (isWalkIn) walkIn += 1;
    else platform += 1;

    if (b.paymentStatus === "paid") {
      paid += 1;
      const amount = Number(b.totalAmount || 0);
      paidRevenue += amount;
      if (b.paymentMethod === "cash") cash += amount;
      else bankTransfer += amount;

      const staffKey = String(b.staffId || "unknown");
      const staffEntry = staffStats.get(staffKey) || { bookings: 0, revenue: 0 };
      staffEntry.bookings += 1;
      staffEntry.revenue += amount;
      staffStats.set(staffKey, staffEntry);
    }

    const hour = new Date(b.startTime).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);

    const services = Array.isArray(b.serviceIds)
      ? (b.serviceIds as Array<{ name?: string; basePrice?: number }>)
      : b.serviceId
        ? [b.serviceId as { name?: string; basePrice?: number }]
        : [];

    for (const svc of services) {
      const name = svc.name || "Service";
      const entry = serviceStats.get(name) || { count: 0, revenue: 0 };
      entry.count += 1;
      if (b.paymentStatus === "paid") {
        entry.revenue += Number(svc.basePrice || 0);
      }
      serviceStats.set(name, entry);
    }
  }

  const prevTotal = prevPaidBookings.reduce(
    (sum, b) => sum + Number(b.totalAmount || 0),
    0,
  );
  const changePercent =
    prevTotal > 0 ? Math.round(((paidRevenue - prevTotal) / prevTotal) * 100) : 0;

  const staffIds = [...staffStats.keys()].filter((id) => id !== "unknown");
  const StaffProfile = (await import("../models/StaffProfile")).default;
  const [staffUsers, staffProfiles] = await Promise.all([
    staffIds.length
      ? User.find({ firebaseUid: { $in: staffIds } })
          .select("firebaseUid fullName profilePicture")
          .lean()
      : Promise.resolve([]),
    staffIds.length
      ? StaffProfile.find({ businessId, staffId: { $in: staffIds } })
          .select("staffId firstName lastName role profilePicture")
          .lean()
      : Promise.resolve([]),
  ]);
  const staffNameById = new Map(
    staffUsers.map((u) => [String(u.firebaseUid), u.fullName || "Staff"]),
  );
  const staffAvatarById = new Map(
    staffUsers.map((u) => [
      String(u.firebaseUid),
      String((u as { profilePicture?: string }).profilePicture || ""),
    ]),
  );
  for (const profile of staffProfiles as Array<{
    staffId?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    profilePicture?: string;
  }>) {
    const id = String(profile.staffId || "");
    if (!id) continue;
    const composed = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (composed) staffNameById.set(id, composed);
    if (profile.profilePicture) staffAvatarById.set(id, profile.profilePicture);
  }
  const staffRoleById = new Map(
    (staffProfiles as Array<{ staffId?: string; role?: string }>).map((p) => [
      String(p.staffId || ""),
      String(p.role || "").trim() || "Staff",
    ]),
  );

  const rankedStaff = [...staffStats.entries()]
    .map(([staffId, stats]) => ({
      staffId,
      name: staffNameById.get(staffId) || "Staff",
      role: staffRoleById.get(staffId) || "Staff",
      avatarUrl: staffAvatarById.get(staffId) || "",
      bookings: stats.bookings,
      revenue: stats.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue);
  const maxStaffRevenue = rankedStaff[0]?.revenue || 0;
  const staffPerformance = rankedStaff.map((row) => ({
    ...row,
    performanceScore:
      maxStaffRevenue > 0
        ? Number(
            Math.min(
              5,
              Math.max(3.5, 3.5 + (row.revenue / maxStaffRevenue) * 1.5),
            ).toFixed(1),
          )
        : 0,
  }));

  const topServices = [...serviceStats.entries()]
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const peakHours = [...hourCounts.entries()]
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour);

  const recentBookings = [...bookings]
    .sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    )
    .slice(0, 12)
    .map((b) => {
      const client = b.clientId as unknown as { fullName?: string } | null;
      const services = Array.isArray(b.serviceIds)
        ? (b.serviceIds as Array<{ name?: string }>)
        : [];
      const primaryService =
        services[0]?.name ||
        (b.serviceId as unknown as { name?: string } | null)?.name ||
        "Service";
      const staffKey = String(b.staffId || "");
      return {
        id: String(b._id),
        customerName: client?.fullName || "Walk-in client",
        serviceName: primaryService,
        bookingDate: new Date(b.startTime).toISOString(),
        staffName: staffNameById.get(staffKey) || "Staff",
        status: getBookingComputedStatus(b),
      };
    });

  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    revenue: {
      total: paidRevenue,
      cash,
      bankTransfer,
      previousPeriodTotal: prevTotal,
      changePercent,
    },
    bookings: {
      total: bookings.length,
      paid,
      walkIn,
      platform,
      cancelled,
      noShow,
      averageTicket: paid > 0 ? Math.round(paidRevenue / paid) : 0,
    },
    staffPerformance,
    topServices,
    peakHours,
    recentBookings,
  };
};

export const listBusinessProducts = async (
  businessId: string,
): Promise<IProduct[]> => {
  return Product.find({ businessId }).sort({ createdAt: -1 }).lean();
};

export const createBusinessProduct = async (
  businessId: string,
  data: {
    name: string;
    brand?: string;
    category?: string;
    description?: string;
    imageUrl?: string;
    price: number;
    stockQuantity?: number;
    minStockAlert?: number;
    isActive?: boolean;
  },
): Promise<IProduct> => {
  const business = await Business.findById(businessId).select("productsEnabled");
  if (!business) throw new ApiError(404, "Business not found");
  if (!business.productsEnabled) {
    throw new ApiError(
      403,
      "Selling is disabled for this shop. Ask a super admin to enable products.",
    );
  }

  const product = await Product.create({
    businessId,
    name: data.name,
    brand: data.brand,
    category: data.category || "General",
    description: data.description || "",
    imageUrl: data.imageUrl || "",
    price: data.price,
    stockQuantity: data.stockQuantity ?? 0,
    minStockAlert: data.minStockAlert ?? 5,
    isActive: data.isActive ?? true,
  });
  return product;
};

export const updateBusinessProduct = async (
  productId: string,
  businessId: string,
  updates: {
    name?: string;
    brand?: string;
    category?: string;
    description?: string;
    imageUrl?: string;
    price?: number;
    stockQuantity?: number;
    minStockAlert?: number;
    isActive?: boolean;
  },
): Promise<IProduct> => {
  const business = await Business.findById(businessId).select("productsEnabled");
  if (!business) throw new ApiError(404, "Business not found");
  if (!business.productsEnabled) {
    throw new ApiError(
      403,
      "Selling is disabled for this shop. Ask a super admin to enable products.",
    );
  }

  const product = await Product.findById(productId);
  if (!product) throw new ApiError(404, "Product not found");
  if (String(product.businessId) !== businessId) {
    throw new ApiError(403, "Product does not belong to this business");
  }

  if (updates.name !== undefined) product.name = updates.name;
  if (updates.brand !== undefined) product.brand = updates.brand;
  if (updates.category !== undefined) product.category = updates.category;
  if (updates.description !== undefined) product.description = updates.description;
  if (updates.imageUrl !== undefined) product.imageUrl = updates.imageUrl;
  if (updates.price !== undefined) product.price = updates.price;
  if (updates.stockQuantity !== undefined) product.stockQuantity = updates.stockQuantity;
  if (updates.minStockAlert !== undefined) product.minStockAlert = updates.minStockAlert;
  if (updates.isActive !== undefined) product.isActive = updates.isActive;

  await product.save();
  return product;
};

export const deleteBusinessProduct = async (
  productId: string,
  businessId: string,
): Promise<void> => {
  const business = await Business.findById(businessId).select("productsEnabled");
  if (!business) throw new ApiError(404, "Business not found");
  if (!business.productsEnabled) {
    throw new ApiError(
      403,
      "Selling is disabled for this shop. Ask a super admin to enable products.",
    );
  }

  const product = await Product.findById(productId);
  if (!product) throw new ApiError(404, "Product not found");
  if (String(product.businessId) !== businessId) {
    throw new ApiError(403, "Product does not belong to this business");
  }

  await product.deleteOne();
};

const escapeRegExp = (value: string): string => {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
};

export const getClientHistory = async (
  clientId: string,
  businessId: string,
  limit: number = 3,
): Promise<{
  client: {
    _id: string;
    fullName: string;
    phoneNumber: string;
    email?: string;
    notes?: string;
    totalSpend: number;
    lastVisit?: Date;
    totalVisits: number;
    updatedAt?: Date;
  };
  recentBookings: Array<{
    _id: string;
    startTime: Date;
    endTime: Date;
    status: string;
    computedStatus: string;
    totalAmount: number;
    services: Array<{ _id: string; name?: string; basePrice?: number }>;
    staffName?: string;
  }>;
}> => {
  const client = await Client.findById(clientId).lean();
  if (!client) throw new ApiError(404, "Client not found");
  if (String(client.businessId) !== businessId) {
    throw new ApiError(403, "Client does not belong to this business");
  }

  const allBookings = await Booking.find({
    businessId,
    $or: [
      { clientId: client._id },
      { userId: String(client._id) },
    ],
  })
    .sort({ startTime: -1 })
    .populate("serviceIds", "name basePrice")
    .lean();

  const recent = allBookings.slice(0, Math.max(1, Math.min(limit, 10)));

  const staffIds = [
    ...new Set(recent.map((b) => String((b as any).staffId || "")).filter(Boolean)),
  ];
  const staffUsers = staffIds.length
    ? await User.find({ firebaseUid: { $in: staffIds } })
        .select("firebaseUid fullName")
        .lean()
    : [];
  const staffNameByKey = new Map<string, string>();
  for (const u of staffUsers as Array<{ firebaseUid?: string; fullName?: string }>) {
    if (u.firebaseUid) staffNameByKey.set(u.firebaseUid, u.fullName || "");
  }

  const now = new Date();
  const recentBookings = recent.map((b) => {
    const computedStatus = getBookingComputedStatus(b, now);
    const services = Array.isArray(b.serviceIds)
      ? (b.serviceIds as Array<{ _id: any; name?: string; basePrice?: number }>).map((s) => ({
          _id: String(s._id),
          name: s.name,
          basePrice: s.basePrice,
        }))
      : [];
    const rawStaff = String((b as any).staffId || "");
    return {
      _id: String((b as any)._id),
      startTime: (b as any).startTime,
      endTime: (b as any).endTime,
      status: String((b as any).status || ""),
      computedStatus,
      totalAmount: Number((b as any).totalAmount || 0),
      services,
      staffName: staffNameByKey.get(rawStaff) || undefined,
    };
  });

  return {
    client: {
      _id: String(client._id),
      fullName: client.fullName,
      phoneNumber: client.phoneNumber,
      email: client.email,
      notes: client.notes,
      updatedAt: (client as any).updatedAt,
      totalSpend: Number(client.totalSpend || 0),
      lastVisit: client.lastVisit,
      totalVisits: allBookings.length,
    },
    recentBookings,
  };
};

export const updateClientNotes = async (
  clientId: string,
  businessId: string,
  notes: string,
): Promise<IClient> => {
  const client = await Client.findById(clientId);
  if (!client) throw new ApiError(404, "Client not found");
  if (String(client.businessId) !== businessId) {
    throw new ApiError(403, "Client does not belong to this business");
  }
  client.notes = notes;
  await client.save();
  return client;
};

export const searchBusinessClients = async (
  businessId: string,
  query?: string,
) => {
  const regex = query ? new RegExp(escapeRegExp(query.trim()), "i") : undefined;

  const clients = await Client.find(
    regex
      ? {
          businessId,
          $or: [
            { fullName: regex },
            { phoneNumber: regex },
            { email: regex },
            { notes: regex },
          ],
        }
      : { businessId },
  )
    .sort({ lastVisit: -1, createdAt: -1 })
    .lean();

  const visits = clients.length ? await Booking.aggregate<{
    _id: Types.ObjectId; totalVisits: number; lastVisit: Date;
  }>([
    { $match: { businessId: new Types.ObjectId(businessId), clientId: { $in: clients.map(c => c._id) } } },
    { $group: { _id: "$clientId", totalVisits: { $sum: 1 }, lastVisit: { $max: "$startTime" } } },
  ]) : [];
  const byClient = new Map(visits.map(row => [String(row._id), row]));
  return {
    clients: clients.map(client => ({
      ...client,
      totalVisits: byClient.get(String(client._id))?.totalVisits ?? 0,
      lastVisit: byClient.get(String(client._id))?.lastVisit ?? client.lastVisit,
    })),
  };
};

// ─── Staff Stats & Visibility ────────────────────────────────

const startOfWeek = (ref: Date = new Date()): Date => {
  const d = startOfDay(ref);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
};

export type StaffPresenceStatus = "online" | "offline" | "busy";

export type StaffStatRow = {
  staffId: string;
  name: string;
  totalServicesProvided: number;
  mostBookedService: string | null;
  totalHoursWorked: number;
  isOnlineVisible: boolean;
  presenceStatus: StaffPresenceStatus;
};

const resolveStaffPresence = (
  isOnlineVisible: boolean,
  hasInProgressBooking: boolean,
): StaffPresenceStatus => {
  if (hasInProgressBooking) return "busy";
  if (!isOnlineVisible) return "offline";
  return "online";
};

const staffHasUpcomingConflict = async (
  businessId: string,
  staffId: string,
): Promise<boolean> => {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 60 * 60 * 1000);

  const conflict = await Booking.findOne({
    businessId,
    staffId,
    status: { $nin: ["cancelled", "expired", "no-show", "no_show"] },
    $or: [
      { startTime: { $lte: now }, endTime: { $gt: now } },
      { startTime: { $gte: now, $lte: windowEnd } },
    ],
  }).lean();

  return Boolean(conflict);
};

export const setStaffOnlineVisibility = async (
  staffId: string,
  businessId: string,
  isOnlineVisible: boolean,
): Promise<IStaffProfile> => {
  const profile = await StaffProfile.findOne({ staffId });
  if (!profile) throw new ApiError(404, "Staff profile not found");
  if (String(profile.businessId) !== businessId) {
    throw new ApiError(403, "Staff does not belong to this business");
  }

  if (!isOnlineVisible) {
    const hasConflict = await staffHasUpcomingConflict(businessId, staffId);
    if (hasConflict) {
      throw new ApiError(
        409,
        "Cannot go offline: Appointment in progress.",
      );
    }
  }

  profile.isOnlineVisible = isOnlineVisible;
  await profile.save();
  return profile;
};

export const getStaffStats = async (
  businessId: string,
): Promise<StaffStatRow[]> => {
  const profiles = await StaffProfile.find({ businessId, isActive: true }).lean();
  if (!profiles.length) return [];

  const staffIds = profiles.map((p) => String(p.staffId));
  const users = await User.find({ firebaseUid: { $in: staffIds } })
    .select("fullName firebaseUid")
    .lean();
  const nameByStaffId = new Map(
    users.map((u) => [String(u.firebaseUid), String(u.fullName || "Staff")]),
  );

  const weekStart = startOfWeek();
  const weekEnd = endOfDay(new Date());

  const weekBookings = await Booking.find({
    businessId,
    staffId: { $in: staffIds },
    startTime: { $gte: weekStart, $lte: weekEnd },
    status: { $nin: ["cancelled", "expired", "no-show", "no_show"] },
  })
    .populate("serviceIds", "name")
    .lean();

  const now = new Date();
  const inProgressStaffIds = new Set<string>();
  for (const booking of weekBookings) {
    if (getBookingComputedStatus(booking, now) === "in-progress") {
      inProgressStaffIds.add(String(booking.staffId));
    }
  }

  const serviceCountsByStaff = new Map<string, Map<string, number>>();
  const completedCountByStaff = new Map<string, number>();
  const hoursByStaff = new Map<string, number>();

  for (const booking of weekBookings) {
    const sid = String(booking.staffId);
    const computed = getBookingComputedStatus(booking, now);
    if (computed !== "completed" && computed !== "in-progress") continue;

    const services = Array.isArray(booking.serviceIds)
      ? (booking.serviceIds as Array<{ name?: string }>)
      : [];
    const serviceCount = Math.max(services.length, 1);
    completedCountByStaff.set(
      sid,
      (completedCountByStaff.get(sid) || 0) + serviceCount,
    );

    const start = new Date(booking.startTime).getTime();
    const end = new Date(booking.endTime).getTime();
    const hours = Math.max(0, (end - start) / (1000 * 60 * 60));
    hoursByStaff.set(sid, (hoursByStaff.get(sid) || 0) + hours);

    if (!serviceCountsByStaff.has(sid)) {
      serviceCountsByStaff.set(sid, new Map());
    }
    const counts = serviceCountsByStaff.get(sid)!;
    for (const svc of services) {
      const name = svc?.name || "Service";
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }

  return profiles.map((profile) => {
    const sid = String(profile.staffId);
    const counts = serviceCountsByStaff.get(sid);
    let mostBookedService: string | null = null;
    if (counts && counts.size > 0) {
      mostBookedService = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }

    const isOnlineVisible = profile.isOnlineVisible !== false;

    return {
      staffId: sid,
      name: nameByStaffId.get(sid) || "Staff",
      totalServicesProvided: completedCountByStaff.get(sid) || 0,
      mostBookedService,
      totalHoursWorked: Number((hoursByStaff.get(sid) || 0).toFixed(1)),
      isOnlineVisible,
      presenceStatus: resolveStaffPresence(
        isOnlineVisible,
        inProgressStaffIds.has(sid),
      ),
    };
  });
};
