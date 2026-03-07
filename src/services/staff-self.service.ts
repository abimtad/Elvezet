import { Types } from "mongoose";
import Business, { IBusiness } from "../models/Business";
import StaffProfile, { IStaffProfile } from "../models/StaffProfile";
import Booking from "../models/Booking";
import Availability, { IAvailability } from "../models/Availability";
import Absence, { IAbsence } from "../models/Absence";
import User from "../models/User";
import ApiError from "../utils/ApiError";
import { emitBookingEvent } from "./realtime.service";
import { toPublicUrl } from "./media.service";

const resolveProfilePicture = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  return toPublicUrl(value);
};

const startOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
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

const attachUserProfiles = async <T extends { userId?: unknown }>(
  bookings: T[],
): Promise<T[]> => {
  const userIds = [
    ...new Set(
      bookings
        .map((booking) => String(booking.userId || ""))
        .filter((id) => Types.ObjectId.isValid(id)),
    ),
  ];

  if (userIds.length === 0) return bookings;

  const users = await User.find({ _id: { $in: userIds } })
    .select("fullName phoneNumber profilePicture")
    .lean();
  const usersById = new Map(users.map((user) => [String(user._id), user]));

  return bookings.map((booking) => {
    const user = usersById.get(String(booking.userId || ""));
    if (user) {
      (booking as Record<string, unknown>).userId = {
        ...user,
        profilePicture: resolveProfilePicture(user.profilePicture),
      };
    }
    return booking;
  });
};

const publicizeBookingPeople = <T extends { userId?: unknown; clientId?: unknown }>(
  booking: T,
): T => {
  const normalized = booking as Record<string, unknown>;
  if (normalized.userId && typeof normalized.userId === "object") {
    const user = normalized.userId as { profilePicture?: string | null };
    normalized.userId = {
      ...(normalized.userId as Record<string, unknown>),
      profilePicture: resolveProfilePicture(user.profilePicture),
    };
  }
  if (normalized.clientId && typeof normalized.clientId === "object") {
    const client = normalized.clientId as { profilePicture?: string | null };
    normalized.clientId = {
      ...(normalized.clientId as Record<string, unknown>),
      profilePicture: resolveProfilePicture(client.profilePicture),
    };
  }
  return booking;
};

// ─── Profile & Business Info ─────────────────────────────────

export const getMyProfile = async (firebaseUid: string) => {
  const user = await User.findOne({ firebaseUid }).lean();
  if (!user) throw new ApiError(404, "User not found");

  const roles = user.roles || [];
  const isIndependent = roles.includes("owner");

  let business: IBusiness | null = null;
  let staffProfile: IStaffProfile | null = null;

  if (isIndependent) {
    business = await Business.findOne({ ownerId: user._id }).lean();
    if (!business) throw new ApiError(404, "Business not found for independent barber");
  } else {
    staffProfile = await StaffProfile.findOne({ staffId: firebaseUid })
      .populate("services", "name duration basePrice")
      .populate("businessId")
      .lean();
    
    if (!staffProfile) throw new ApiError(404, "Staff profile not found");
    business = staffProfile.businessId as unknown as IBusiness;
  }

  return {
    user: {
      _id: user._id,
      firebaseUid: user.firebaseUid,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      profilePicture: resolveProfilePicture(user.profilePicture),
      roles: user.roles,
    },
    staffProfile,
    business: {
      _id: business._id,
      name: business.name,
      type: business.type,
      location: business.location,
      openingTime: business.openingTime,
      closingTime: business.closingTime,
    },
    myRole: isIndependent ? "independent" : "staff",
  };
};

// ─── Bookings ────────────────────────────────────────────────

export const getMyBookings = async (
  firebaseUid: string,
  filters: {
    date?: string;
    status?: "today" | "completed" | "pending" | "all";
  },
) => {
  const staffProfile = await StaffProfile.findOne({ staffId: firebaseUid });
  if (!staffProfile) throw new ApiError(404, "Staff profile not found");

  const query: Record<string, unknown> = {
    staffId: firebaseUid,
  };

  if (filters.date) {
    const startOfDay = new Date(filters.date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(filters.date);
    endOfDay.setHours(23, 59, 59, 999);
    query.startTime = { $gte: startOfDay, $lte: endOfDay };
  }

  if (filters.status === "completed") {
    query.status = "confirmed";
    query.paymentStatus = "paid";
  } else if (filters.status === "pending") {
    query.status = { $in: ["pending", "confirmed"] };
  } else if (filters.status === "today") {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    query.startTime = { $gte: now, $lte: endOfToday };
  }

  const bookings = await Booking.find(query)
    .populate("clientId", "fullName phoneNumber email profilePicture")
    .populate("userId", "fullName phoneNumber profilePicture")
    .populate("serviceIds", "name duration basePrice category")
    .sort({ startTime: 1 })
    .lean();
  const bookingsWithUsers = (await attachUserProfiles(bookings)).map(
    publicizeBookingPeople,
  );

  // Calculate progress for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayBookings = await Booking.countDocuments({
    staffId: firebaseUid,
    startTime: { $gte: today },
  });
  const completedToday = await Booking.countDocuments({
    staffId: firebaseUid,
    startTime: { $gte: today },
    status: "confirmed",
    paymentStatus: "paid",
  });

  const progressPercentage = todayBookings > 0 
    ? Math.round((completedToday / todayBookings) * 100) 
    : 0;

  return {
    bookings: bookingsWithUsers,
    todayStats: {
      total: todayBookings,
      completed: completedToday,
      progressPercentage,
    },
  };
};

export const getMyBookingsCalendar = async (
  firebaseUid: string,
  month?: string,
) => {
  const staffProfile = await StaffProfile.findOne({ staffId: firebaseUid });
  if (!staffProfile) throw new ApiError(404, "Staff profile not found");

  let startDate: Date;
  let endDate: Date;

  if (month) {
    const [year, monthNum] = month.split("-").map(Number);
    startDate = new Date(year, monthNum - 1, 1);
    endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);
  } else {
    startDate = new Date();
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  const bookings = await Booking.aggregate([
    {
      $match: {
        staffId: firebaseUid,
        startTime: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$startTime" },
        },
        count: { $sum: 1 },
        hasAppointments: { $sum: 1 },
      },
    },
    {
      $project: {
        date: "$_id",
        count: 1,
        _id: 0,
      },
    },
  ]);

  return {
    month: month || startDate.toISOString().slice(0, 7),
    datesWithAppointments: bookings,
  };
};

export const getMyBookingsTimeline = async (
  firebaseUid: string,
  date: string,
) => {
  const staffProfile = await StaffProfile.findOne({ staffId: firebaseUid });
  if (!staffProfile) throw new ApiError(404, "Staff profile not found");

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const bookings = await Booking.find({
    staffId: firebaseUid,
    startTime: { $gte: startOfDay, $lte: endOfDay },
  })
    .populate("clientId", "fullName phoneNumber profilePicture")
    .populate("userId", "fullName phoneNumber profilePicture")
    .populate("serviceIds", "name duration basePrice category")
    .sort({ startTime: 1 })
    .lean();
  const bookingsWithUsers = (await attachUserProfiles(bookings)).map(
    publicizeBookingPeople,
  );

  // Calculate position and height for timeline rendering
  const timelineBookings = bookingsWithUsers.map((booking) => {
    const startTime = new Date(booking.startTime);
    const endTime = new Date(booking.endTime);
    
    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

    return {
      ...booking,
      timelinePosition: {
        startMinutes,
        durationMinutes,
        topOffset: startMinutes * 1.67, // 1 minute = ~1.67px (adjustable)
        height: durationMinutes * 1.67,
      },
    };
  });

  return {
    date,
    bookings: timelineBookings,
  };
};

// ─── Booking Actions ─────────────────────────────────────────

export const completeMyBooking = async (
  firebaseUid: string,
  bookingId: string,
) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.staffId !== firebaseUid) {
    throw new ApiError(403, "You can only complete your own bookings");
  }

  if (booking.status !== "confirmed" || booking.startTime > new Date()) throw new ApiError(409, "Only a started, confirmed appointment can be completed");
  if (booking.staffPlan?.some(segment => segment.staffId !== firebaseUid)) throw new ApiError(409, "Complete your assigned service from the staff workspace for a shared appointment");
  // Completion never proves that a customer payment was received.
  booking.completedAt = booking.completedAt || new Date();
  await booking.save();
  emitBookingEvent("booking:updated", booking);

  return booking;
};

export const noShowMyBooking = async (
  firebaseUid: string,
  bookingId: string,
) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.staffId !== firebaseUid) {
    throw new ApiError(403, "You can only mark your own bookings as no-show");
  }

  booking.status = "no-show";
  await booking.save();
  emitBookingEvent("booking:updated", booking);

  return booking;
};

export const startMyBooking = async (
  firebaseUid: string,
  bookingId: string,
) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.staffId !== firebaseUid) {
    throw new ApiError(403, "You can only start your own bookings");
  }

  // Mark as confirmed (in-progress status)
  booking.status = "confirmed";
  await booking.save();
  emitBookingEvent("booking:updated", booking);

  return booking;
};

// ─── Stats & Revenue ─────────────────────────────────────────

export const getMyStats = async (
  firebaseUid: string,
  filters: {
    from?: string;
    to?: string;
    period?: "week" | "month" | "day";
  },
) => {
  // Revenue only needs role and commission, not populated services/business data.
  const [user, staffProfile] = await Promise.all([
    User.findOne({ firebaseUid }).select("roles").lean(),
    StaffProfile.findOne({ staffId: firebaseUid }).select("serviceCommission").lean(),
  ]);
  if (!user) throw new ApiError(404, "User not found");
  const isIndependent = (user.roles || []).includes("owner");
  if (isIndependent) {
    if (!(await Business.exists({ ownerId: user._id }))) {
      throw new ApiError(404, "Business not found for independent barber");
    }
  } else if (!staffProfile) {
    throw new ApiError(404, "Staff profile not found");
  }

  let startDate: Date;
  let endDate: Date;

  if (filters.from && filters.to) {
    startDate = new Date(filters.from);
    endDate = new Date(filters.to);
  } else {
    endDate = new Date();
    if (filters.period === "week") {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
    } else if (filters.period === "month") {
      startDate = new Date();
      startDate.setDate(1);
    } else {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
    }
  }

  const query: Record<string, unknown> = {
    staffId: firebaseUid,
    status: "confirmed",
    paymentStatus: "paid",
    startTime: { $gte: startDate, $lte: endDate },
  };

  // One indexed scan supplies all dashboard totals, rather than five round trips.
  const [result] = await Booking.aggregate([
    { $match: query },
    {
      $facet: {
        totals: [{ $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
          hours: { $sum: { $divide: [{ $subtract: ["$endTime", "$startTime"] }, 3600000] } },
        } }],
        serviceBreakdown: [
          { $unwind: "$serviceIds" },
          { $lookup: { from: "services", localField: "serviceIds", foreignField: "_id", as: "serviceDetails" } },
          { $unwind: "$serviceDetails" },
          { $group: { _id: "$serviceDetails.name", count: { $sum: 1 }, totalRevenue: { $sum: "$serviceDetails.basePrice" } } },
          { $sort: { totalRevenue: -1 } },
        ],
        dailyRevenue: [
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$startTime" } }, revenue: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);
  const totals = result?.totals[0];
  const completedBookings = totals?.count || 0;
  const totalRevenue = totals?.revenue || 0;
  const hoursWorked = Math.round((totals?.hours || 0) * 10) / 10;
  const myEarnings = isIndependent
    ? totalRevenue
    : (totalRevenue * (staffProfile?.serviceCommission?.value || 0)) / 100;
  const serviceBreakdown = result?.serviceBreakdown || [];
  const dailyRevenue = result?.dailyRevenue || [];

  return {
    period: filters.period || "week",
    from: startDate.toISOString(),
    to: endDate.toISOString(),
    completedBookings,
    hoursWorked,
    totalRevenue: isIndependent ? totalRevenue : 0, // Hide for staff
    myEarnings,
    serviceBreakdown,
    dailyRevenue,
    canSeeFullRevenue: isIndependent,
  };
};

// ─── Availability ────────────────────────────────────────────

export const getMyAvailability = async (firebaseUid: string) => {
  const staffProfile = await StaffProfile.findOne({ staffId: firebaseUid });
  if (!staffProfile) throw new ApiError(404, "Staff profile not found");

  const availability = await Availability.find({ staffId: firebaseUid })
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  return availability;
};

export const setMyAvailability = async (
  firebaseUid: string,
  entries: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
) => {
  const staffProfile = await StaffProfile.findOne({ staffId: firebaseUid });
  if (!staffProfile) throw new ApiError(404, "Staff profile not found");

  const business = await Business.findById(staffProfile.businessId).select(
    "openingTime closingTime",
  );
  if (!business) throw new ApiError(404, "Business not found");

  const savedAvailability: IAvailability[] = [];

  for (const entry of entries) {
    assertWithinBusinessHours(business, entry.startTime, entry.endTime);
    const availability = await Availability.findOneAndUpdate(
      { staffId: firebaseUid, dayOfWeek: entry.dayOfWeek },
      {
        staffId: firebaseUid,
        dayOfWeek: entry.dayOfWeek,
        startTime: entry.startTime,
        endTime: entry.endTime,
      },
      { upsert: true, new: true },
    );
    savedAvailability.push(availability);
  }

  return savedAvailability;
};

// ─── Absences ────────────────────────────────────────────────

export const getMyAbsences = async (
  firebaseUid: string,
  from?: Date,
  to?: Date,
) => {
  const staffProfile = await StaffProfile.findOne({ staffId: firebaseUid });
  if (!staffProfile) throw new ApiError(404, "Staff profile not found");

  const filter: Record<string, unknown> = { staffId: firebaseUid };
  if (from || to) {
    filter.startTime = {};
    if (from) (filter.startTime as Record<string, unknown>).$gte = from;
    if (to) (filter.startTime as Record<string, unknown>).$lte = to;
  }

  const absences = await Absence.find(filter).sort({ startTime: 1 }).lean();
  return absences;
};

export const createMyAbsence = async (
  firebaseUid: string,
  businessId: string,
  data: { startTime: Date; endTime: Date; reason?: string },
) => {
  const staffProfile = await StaffProfile.findOne({ staffId: firebaseUid });
  if (!staffProfile) throw new ApiError(404, "Staff profile not found");
  if (String(staffProfile.businessId) !== businessId) {
    throw new ApiError(403, "Staff does not belong to this business");
  }

  const business = await Business.findById(businessId).select("openingTime closingTime");
  if (!business) throw new ApiError(404, "Business not found");
  assertAbsenceWithinBusinessHours(business, data.startTime, data.endTime);

  const absence = await Absence.create({
    staffId: firebaseUid,
    businessId,
    startTime: data.startTime,
    endTime: data.endTime,
    reason: data.reason,
  });

  return absence;
};

export const deleteMyAbsence = async (
  firebaseUid: string,
  absenceId: string,
) => {
  const absence = await Absence.findById(absenceId);
  if (!absence) throw new ApiError(404, "Absence not found");
  if (absence.staffId !== firebaseUid) {
    throw new ApiError(403, "You can only delete your own absences");
  }

  await absence.deleteOne();
};

// ─── Visibility Toggle ───────────────────────────────────────

export const toggleMyVisibility = async (
  firebaseUid: string,
  isOnlineVisible: boolean,
) => {
  const staffProfile = await StaffProfile.findOne({ staffId: firebaseUid });
  if (!staffProfile) throw new ApiError(404, "Staff profile not found");

  // Validation: Cannot go offline if active appointment in current hour
  if (!isOnlineVisible) {
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

    const activeBooking = await Booking.findOne({
      staffId: firebaseUid,
      startTime: { $lte: oneHourLater },
      endTime: { $gte: now },
      status: { $in: ["pending", "confirmed"] },
    });

    if (activeBooking) {
      throw new ApiError(
        400,
        "Cannot go offline during an active appointment slot. Please complete or cancel your current booking first.",
      );
    }
  }

  staffProfile.isOnlineVisible = isOnlineVisible;
  await staffProfile.save();

  return {
    isOnlineVisible: staffProfile.isOnlineVisible,
    message: isOnlineVisible
      ? "You are now visible to customers"
      : "You are now hidden from customers",
  };
};
