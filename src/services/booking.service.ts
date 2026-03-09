import { bookingSession, bookingTransaction, finishBookingSession, afterOfflineCommit } from './offline-transaction';
import mongoose, { Types } from "mongoose";
import env from "../config/env";
import { getRedisClient } from "../config/redis";
import Booking, { IBooking } from "../models/Booking";
import Absence from "../models/Absence";
import Availability from "../models/Availability";
import Business, { IBusiness } from "../models/Business";
import Client from "../models/Client";
import Product from "../models/Product";
import Service from "../models/Service";
import StaffProfile from "../models/StaffProfile";
import User from "../models/User";
import {
  getExpiryQueue,
  getNotificationQueue,
} from "../jobs/queue";
import ApiError from "../utils/ApiError";
import { formatReceipt } from "../utils/receipt.formatter";
import { calculateQuoteForBusiness } from "./business.service";
import { emitBookingEvent } from "./realtime.service";
import { notifyBookingEvent } from "./booking-notifications.service";

const independentWorkingWindow = async (business: IBusiness, start: Date, end: Date, session?: mongoose.ClientSession): Promise<string[]> => {
  const owner = await User.findById(business.ownerId).select("firebaseUid").session(session ?? null);
  const ownerId = String(business.ownerId);
  const aliases = [...new Set([ownerId, owner?.firebaseUid].filter((id): id is string => Boolean(id)))];
  const localStart = new Date(start.getTime() + 3 * 3600000), localEnd = new Date(end.getTime() + 3 * 3600000);
  if (business.weeklySchedule?.some(day => day.dayOfWeek === localStart.getUTCDay() && !day.isOpen)) throw new ApiError(409, "The barber is closed on this day");
  let periods = await Availability.find({ staffId: ownerId }).session(session ?? null);
  if (!periods.length) periods = await Availability.find({ staffId: owner?.firebaseUid }).session(session ?? null);
  const minutes = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };
  const from = localStart.getUTCHours() * 60 + localStart.getUTCMinutes();
  const to = localEnd.getUTCHours() * 60 + localEnd.getUTCMinutes();
  if (localStart.toISOString().slice(0,10) !== localEnd.toISOString().slice(0,10) || !periods.some(period => period.dayOfWeek === localStart.getUTCDay() && from >= minutes(period.startTime) && to <= minutes(period.endTime))) {
    throw new ApiError(409, "Appointment falls outside the barber's working hours");
  }
  return aliases;
};

export const queueBookingNotifications = async (booking: IBooking): Promise<void> => {
  if (!booking.notificationEvents?.includes("booking_confirmed")) return;
  await notifyBookingEvent(String(booking._id), "booking_confirmed");
};

const queueBookingExpiry = async (booking: IBooking): Promise<void> => {
  if (booking.status !== "pending") return;

  const expiryQueue = getExpiryQueue();
  await expiryQueue.add(
    "booking-expiry",
    { bookingId: String(booking._id) },
    {
      delay: 10 * 60 * 1000,
      jobId: `booking-expiry:${String(booking._id)}`,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
};

/** Staff with no explicit service list can perform all shop services on walk-ins. */
const resolveAllowedServiceIdsForStaff = async (
  profile: { services?: Types.ObjectId[] },
  businessId: string,
  isWalkIn: boolean,
): Promise<Set<string>> => {
  const assigned = new Set(
    (profile.services || []).map((id) => String(id)).filter(Boolean),
  );
  if (assigned.size > 0) return assigned;
  if (!isWalkIn) return assigned;
  const shopServices = await Service.find({ businessId }).select("_id").lean();
  return new Set(shopServices.map((row) => String(row._id)));
};

export const createBooking = async ({
  userId,
  businessId,
  serviceIds,
  userLat,
  userLng,
  paymentScreenshotUrl,
  staffPlan,
  startTime,
  endTime,
  paymentMethod,
  isWalkIn = false,
  clientId,
  forceConfirmed = false,
}: {
  userId: Types.ObjectId | string;
  businessId: string;
  serviceIds: string[];
  userLat?: number;
  userLng?: number;
  paymentScreenshotUrl?: string;
  staffPlan: Array<{
    staffId: string;
    serviceId: string;
    startTime: string;
    endTime: string;
  }>;
  startTime: string;
  endTime: string;
  paymentMethod?:
    | "cash"
    | "in-shop"
    | "chapa"
    | "cbe"
    | "cbe_birr"
    | "telebirr"
    | "online_other";
  isWalkIn?: boolean;
  clientId?: Types.ObjectId;
  forceConfirmed?: boolean;
}): Promise<IBooking> => {
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    throw new ApiError(400, "serviceIds must contain at least one service");
  }

  if (!Array.isArray(staffPlan) || staffPlan.length === 0) {
    throw new ApiError(400, "staffPlan must contain at least one item");
  }

  const requestedStart = new Date(startTime);
  const requestedEnd = new Date(endTime);
  if (Number.isNaN(requestedStart.getTime()))
    throw new ApiError(400, "Invalid startTime");
  if (Number.isNaN(requestedEnd.getTime()))
    throw new ApiError(400, "Invalid endTime");
  if (!isWalkIn && requestedStart <= new Date()) {
    throw new ApiError(400, "Booking start time must be in the future");
  }
  if (requestedEnd <= requestedStart)
    throw new ApiError(400, "endTime must be after startTime");

  const lockKey = `lock:${businessId}:${requestedStart.toISOString()}`;
  const lockValue = String(userId);
  let redis: ReturnType<typeof getRedisClient> | null = null;
  let lockAcquired = false;

  try {
    redis = getRedisClient();
    const lockResult = await redis.set(
      lockKey,
      lockValue,
      "EX",
      Number(env.BOOKING_LOCK_TTL_SECONDS),
      "NX",
    );

    if (lockResult !== "OK")
      throw new ApiError(409, "Slot is currently being booked. Please retry.");

    lockAcquired = true;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.warn(
      "Redis booking lock unavailable; continuing with Mongo overlap checks:",
      error instanceof Error ? error.message : error,
    );
  }

  try {
    const booking = await Promise.resolve(bookingSession()).then(async (session) => {
      try {
        let createdBooking: IBooking | null = null;

        await bookingTransaction(session, async () => {
          const business = await Business.findById(businessId).session(session);
          if (!business) throw new ApiError(404, "Business not found");
          // Serialize overlapping online/offline booking creation in Mongo too,
          // including different start times and temporary Redis outages.
          await Business.updateOne({ _id: businessId }, { $inc: { __v: 1 } }, { session });
          if (business.type === "independent" && !isWalkIn && requestedStart.getTime() < Date.now() + (business.minimumNoticeMinutes ?? 0) * 60000) {
            throw new ApiError(400, "This appointment does not meet the barber's advance booking notice");
          }
          if (business.isVisible === false && !isWalkIn) {
            throw new ApiError(403, "This business is currently unavailable");
          }

          const services = await Service.find({
            _id: { $in: serviceIds },
            businessId,
            isActive: { $ne: false },
          }).session(session);

          if (services.length !== serviceIds.length) {
            throw new ApiError(404, "One or more services were not found");
          }

          const basePrice = services.reduce(
            (sum, service) => sum + (Number(service.basePrice) || 0),
            0,
          );

          let totalAmount = basePrice;
          if ((business as { type?: string }).type === "independent") {
            if (typeof userLat !== "number" || typeof userLng !== "number") {
              throw new ApiError(
                400,
                "userLat and userLng are required for independent bookings",
              );
            }

            const quote = calculateQuoteForBusiness(business, services, {
              userLat,
              userLng,
              serviceIds,
            });
            totalAmount = quote.totalPrice;
          }

          const normalizedIncomingPlan = staffPlan.map((item) => ({
            staffId: String(item.staffId),
            serviceId: String(item.serviceId),
            startTime: new Date(item.startTime).toISOString(),
            endTime: new Date(item.endTime).toISOString(),
          }));

          if (
            normalizedIncomingPlan.some(
              (item) =>
                Number.isNaN(new Date(item.startTime).getTime()) ||
                Number.isNaN(new Date(item.endTime).getTime()) ||
                new Date(item.endTime) <= new Date(item.startTime),
            )
          ) {
            throw new ApiError(400, "Invalid booking plan times");
          }

          const sortedPlan = [...normalizedIncomingPlan].sort(
            (a, b) =>
              new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
          );

          const planWindowStart = new Date(sortedPlan[0].startTime);
          const planWindowEnd = new Date(
            sortedPlan[sortedPlan.length - 1].endTime,
          );

          if (
            planWindowStart.getTime() !== requestedStart.getTime() ||
            planWindowEnd.getTime() !== requestedEnd.getTime()
          ) {
            throw new ApiError(
              400,
              "startTime/endTime must match the provided staffPlan window",
            );
          }

          for (let i = 1; i < sortedPlan.length; i += 1) {
            const prevEnd = new Date(sortedPlan[i - 1].endTime).getTime();
            const nextStart = new Date(sortedPlan[i].startTime).getTime();
            if (nextStart < prevEnd) {
              throw new ApiError(
                400,
                "staffPlan contains overlapping segments",
              );
            }

            // Enforce gapless continuous block: segments must be contiguous
            if (nextStart !== prevEnd) {
              throw new ApiError(
                400,
                "staffPlan must form a continuous, gapless time block",
              );
            }
          }

          const serviceIdSet = new Set(serviceIds.map(String));
          const planServiceIdSet = new Set(
            sortedPlan.map((item) => item.serviceId),
          );

          if (
            sortedPlan.some((item) => !serviceIdSet.has(item.serviceId)) ||
            serviceIdSet.size !== planServiceIdSet.size ||
            [...serviceIdSet].some((id) => !planServiceIdSet.has(id))
          ) {
            throw new ApiError(
              400,
              "serviceIds must match the services used in staffPlan",
            );
          }

          const planStaffIds = [
            ...new Set(sortedPlan.map((item) => item.staffId)),
          ];
          const servicesByStaff = new Map<string, Set<string>>();

          // If business is an independent (shop of one), ensure the owner
          // is the only staff in the plan and allow booking even if there
          // is no separate StaffProfile record for that owner.
          if ((business as { type?: string }).type === "independent") {
            const ownerId = String((business as { ownerId?: unknown }).ownerId);
            const invalid = planStaffIds.some((id) => id !== ownerId);
            if (invalid) {
              throw new ApiError(
                400,
                "Independent business bookings must use the shop owner as the professional",
              );
            }

            servicesByStaff.set(ownerId, new Set(serviceIds.map(String)));

            // validate that plan items are allowed by servicesByStaff
            if (
              sortedPlan.some(
                (item) => !servicesByStaff.get(item.staffId)?.has(item.serviceId),
              )
            ) {
              throw new ApiError(
                400,
                "staffPlan contains a staff member not assigned to one of the selected services",
              );
            }
          } else {
            const staffProfiles = await StaffProfile.find({
              staffId: { $in: planStaffIds },
              businessId,
              isActive: true,
              ...(!isWalkIn ? { isOnlineVisible: { $ne: false }, isBookableInCalendar: { $ne: false } } : {}),
            }).session(session);

            if (staffProfiles.length !== planStaffIds.length) {
              throw new ApiError(400, "One or more staff members are invalid");
            }

            for (const profile of staffProfiles) {
              servicesByStaff.set(
                String(profile.staffId),
                await resolveAllowedServiceIdsForStaff(
                  profile,
                  businessId,
                  isWalkIn,
                ),
              );
            }

            if (
              sortedPlan.some(
                (item) => !servicesByStaff.get(item.staffId)?.has(item.serviceId),
              )
            ) {
              throw new ApiError(
                400,
                isWalkIn
                  ? "This staff member cannot perform the selected service. Edit the staff profile and assign services, then try again."
                  : "staffPlan contains a staff member not assigned to one of the selected services",
              );
            }
          }

          // initial overlap check (existing behavior)
          const bookingGap = business.type === "independent" ? (business.bookingBufferMinutes ?? 10) * 60000 : 0;
          const conflictStaffIds = business.type === "independent" ? await independentWorkingWindow(business, requestedStart, requestedEnd, session) : planStaffIds;
          const overlapping = await Booking.findOne({
            businessId,
            status: { $in: ["confirmed", "pending"] },
            $or: [
              { staffId: { $in: conflictStaffIds } },
              { "staffPlan.staffId": { $in: conflictStaffIds } },
            ],
            startTime: { $lt: new Date(requestedEnd.getTime() + bookingGap) },
            endTime: { $gt: new Date(requestedStart.getTime() - bookingGap) },
          }).session(session);

          if (overlapping) {
            throw new ApiError(409, "Slot no longer available");
          }

          // FINAL GUARD CHECK: re-run a focused availability check immediately
          // before creating the booking to catch any Bookings or Absences
          // that may have been inserted in the brief window since validation.
          const finalOverlap = await Booking.findOne({
            businessId,
            status: { $in: ["confirmed", "pending"] },
            $or: [
              { staffId: { $in: conflictStaffIds } },
              { "staffPlan.staffId": { $in: conflictStaffIds } },
            ],
            startTime: { $lt: requestedEnd },
            endTime: { $gt: requestedStart },
          }).session(session);

          if (finalOverlap) {
            throw new ApiError(409, "Slot no longer available");
          }

          const recentAbsence = await Absence.findOne({
            staffId: { $in: conflictStaffIds },
            startTime: { $lt: requestedEnd },
            endTime: { $gt: requestedStart },
          }).session(session);

          if (recentAbsence) {
            throw new ApiError(409, "Slot no longer available");
          }

          const primaryStaffId = sortedPlan[0].staffId;
          const primaryServiceId = sortedPlan[0].serviceId;

          const bookingPayload: Record<string, unknown> = {
            notificationEvents: ["booking_created"],
            userId,
            businessId,
            clientId,
            staffId: primaryStaffId,
            serviceIds,
            serviceId: primaryServiceId,
            servicePriceSnapshots: services.map(service => ({ serviceId: service._id, unitPrice: service.basePrice })),
            totalAmount,
            paymentScreenshotUrl,
            staffPlan: sortedPlan,
            startTime: requestedStart,
            endTime: requestedEnd,
            status:
              forceConfirmed
                ? "confirmed"
                : (business as { type?: string }).type === "independent" ||
                    Boolean(
                      (business as { requirePrepayment?: boolean })
                        .requirePrepayment,
                    ) ||
                    paymentMethod === "chapa" ||
                    paymentMethod === "telebirr" ||
                    paymentMethod === "cbe" ||
                    paymentMethod === "cbe_birr" ||
                    paymentMethod === "online_other"
                  ? "pending"
                  : "confirmed",
            paymentMethod:
              paymentMethod === "chapa"
                ? "telebirr"
                : paymentMethod || "in-shop",
            paymentStatus: "unpaid",
            paymentVerificationStatus: "none",
            isWalkIn,
          };

          const created = await Booking.create(
            [
              bookingPayload as unknown as Partial<IBooking> &
                Record<string, unknown>,
            ],
            { session },
          );

          createdBooking = created[0];
        });

        if (!createdBooking) {
          throw new ApiError(500, "Failed to create booking");
        }

        const resolvedBooking = createdBooking as IBooking;
        await afterOfflineCommit(() => {
        emitBookingEvent("booking:new", resolvedBooking);
        void notifyBookingEvent(String(resolvedBooking._id), "booking_created").catch(() => undefined);
        // Mongo recovery already expires overdue pending bookings if Redis is unavailable.
        if (resolvedBooking.status === "pending") {
          void queueBookingExpiry(resolvedBooking).catch(() => console.warn("Booking expiry queue deferred"));
        }

        });
        return resolvedBooking;
      } finally {
        await finishBookingSession(session);
      }
    });
    return booking;
  } finally {
    if (redis && lockAcquired) {
      try {
        await redis.del(lockKey);
      } catch (error) {
        console.warn(
          "Failed to release Redis booking lock:",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
};

export const rescheduleBooking = async ({
  bookingId,
  requester,
  startTime,
  endTime,
  staffId,
}: {
  bookingId: string;
  requester: {
    _id: Types.ObjectId;
    roles: Array<"customer" | "staff" | "owner" | "admin" | "moderator">;
  };
  startTime: string;
  endTime: string;
  staffId?: string;
}): Promise<IBooking> => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");

  if (booking.status === "cancelled" || booking.status === "expired") {
    throw new ApiError(
      400,
      `Cannot reschedule a booking with status '${booking.status}'`,
    );
  }

  const business = await Business.findById(booking.businessId);
  if (!business) throw new ApiError(404, "Business not found");

  const isOwner =
    requester.roles.includes("owner") &&
    String(business.ownerId) === String(requester._id);
  const isOwnerOrStaff = Boolean(isOwner) || requester.roles.includes("staff");
  const isCustomerOwner = String(booking.userId) === String(requester._id);
  const isNoShowStatus =
    booking.status === "no-show" || booking.status === "no_show";

  if (!isOwnerOrStaff && !isCustomerOwner) {
    throw new ApiError(403, "Not allowed to reschedule this booking");
  }

  if (isNoShowStatus && !isOwnerOrStaff) {
    throw new ApiError(
      400,
      "Only staff or owner can reschedule a no-show booking",
    );
  }

  const newStart = new Date(startTime);
  const newEnd = new Date(endTime);
  if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime())) {
    throw new ApiError(400, "Invalid startTime or endTime");
  }
  if (newEnd <= newStart) {
    throw new ApiError(400, "endTime must be after startTime");
  }

  const targetStaffId = staffId?.trim() || booking.staffId;
  const conflictStaffIds = business.type === "independent" ? await independentWorkingWindow(business, newStart, newEnd) : [targetStaffId];
  if (business.type === "independent" && !conflictStaffIds.includes(targetStaffId)) throw new ApiError(403, "Independent appointments must use the business owner");
  const bookingGap = business.type === "independent" ? (business.bookingBufferMinutes ?? 10) * 60000 : 0;

  if (
    !isOwnerOrStaff &&
    isCustomerOwner &&
    newStart.getTime() <= Date.now()
  ) {
    throw new ApiError(400, "New start time must be in the future");
  }

  const overlapping = await Booking.findOne({
    _id: { $ne: booking._id },
    businessId: booking.businessId,
    status: { $in: ["confirmed", "pending"] },
    $or: [
      { staffId: { $in: conflictStaffIds } },
      { "staffPlan.staffId": { $in: conflictStaffIds } },
    ],
    startTime: { $lt: new Date(newEnd.getTime() + bookingGap) },
    endTime: { $gt: new Date(newStart.getTime() - bookingGap) },
  });

  if (overlapping) {
    throw new ApiError(409, "Slot conflicts with another booking");
  }

  const absence = await Absence.findOne({
    staffId: { $in: conflictStaffIds },
    startTime: { $lt: newEnd },
    endTime: { $gt: newStart },
  });
  if (absence) {
    throw new ApiError(409, "Staff has an absence during this slot");
  }

  if (
    business.type !== "independent" &&
    targetStaffId &&
    booking.serviceIds &&
    booking.serviceIds.length > 0
  ) {
    const staffProfile = await StaffProfile.findOne({
      staffId: targetStaffId,
      businessId: booking.businessId,
      isActive: true,
    });
    if (!staffProfile) {
      throw new ApiError(400, "Target staff is not available for this business");
    }
    const allowedServiceIds = new Set(
      (staffProfile.services || []).map((id) => String(id)),
    );
    const allBookingServiceIds = booking.serviceIds.map((id) => String(id));
    const unsupported = allBookingServiceIds.some(
      (id) => !allowedServiceIds.has(id),
    );
    if (unsupported) {
      throw new ApiError(
        400,
        "Target staff cannot perform one or more services on this booking",
      );
    }
  }

  const existingPlan = Array.isArray(booking.staffPlan)
    ? booking.staffPlan
    : [];

  const newPlan = existingPlan.length
    ? existingPlan.map((segment, index, arr) => {
        const fraction = arr.length > 1 ? index / (arr.length - 1) : 0;
        const segmentStart = new Date(
          newStart.getTime() +
            (newEnd.getTime() - newStart.getTime()) * fraction,
        );
        const segmentEndFraction =
          arr.length > 1 ? (index + 1) / arr.length : 1;
        const segmentEnd = new Date(
          newStart.getTime() +
            (newEnd.getTime() - newStart.getTime()) * segmentEndFraction,
        );
        return {
          ...segment,
          staffId: targetStaffId,
          startTime: index === 0 ? newStart : segmentStart,
          endTime: index === arr.length - 1 ? newEnd : segmentEnd,
        };
      })
    : [
        {
          staffId: targetStaffId,
          serviceId: booking.serviceId || booking.serviceIds[0],
          startTime: newStart,
          endTime: newEnd,
        },
      ];

  booking.startTime = newStart;
  booking.endTime = newEnd;
  booking.staffId = targetStaffId;
  (booking as any).staffPlan = newPlan;
  if (isNoShowStatus && isOwnerOrStaff) {
    booking.status = "confirmed";
    booking.noShowMarkedAt = undefined;
  }
  await booking.save();

  return booking;
};

export const listBookingsForUser = async (
  userId: Types.ObjectId | string,
): Promise<IBooking[]> => {
  return Booking.find({ userId: String(userId) })
    .sort({ startTime: -1 })
    .populate(
      "businessId",
      "name type addressString logoUrl coverImageUrl rating isVisible",
    )
    .populate("serviceIds", "name duration basePrice categoryName")
    .populate("serviceId", "name duration basePrice categoryName")
    .populate({
      path: "staffId",
      populate: { path: "userId", select: "fullName email" },
    });
};

export const cancelBooking = async ({
  bookingId,
  requester,
  reason,
}: {
  bookingId: string;
  requester: {
    _id: Types.ObjectId;
    roles: Array<"customer" | "staff" | "owner" | "admin" | "moderator">;
  };
  reason?: string;
}): Promise<IBooking> => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");

  const business = await Business.findById(booking.businessId);
  if (
    booking.status === "cancelled" ||
    booking.status === "expired" ||
    booking.status === "no-show" ||
    booking.status === "no_show"
  ) {
    throw new ApiError(
      400,
      `Cannot cancel a booking with status '${booking.status}'`,
    );
  }

  const isOwner =
    requester.roles.includes("owner") &&
    business &&
    String(business.ownerId) === String(requester._id);
  const isOwnerOrStaff = Boolean(isOwner) || requester.roles.includes("staff");
  const isCustomerOwner = String(booking.userId) === String(requester._id);

  if (!isCustomerOwner && !isOwnerOrStaff)
    throw new ApiError(403, "Not allowed to cancel this booking");

  const cancellationWindow =
    business?.cancellationWindowMinutes ?? env.CANCELLATION_WINDOW_MINUTES;
  const minutesBefore =
    (new Date(booking.startTime).getTime() - Date.now()) / (1000 * 60);

  if (isCustomerOwner && minutesBefore < cancellationWindow) {
    throw new ApiError(
      400,
      `Cancellations must be made at least ${cancellationWindow} minutes before appointment`,
    );
  }

  booking.status = "cancelled";
  booking.cancelledBy = requester._id;
  booking.cancelledAt = new Date();
  booking.cancellationReason = reason || "";
  await booking.save();

  await notifyBookingEvent(String(booking._id), "booking_cancelled");

  return booking;
};

export const markBookingPaid = async ({
  bookingId,
  requester,
}: {
  bookingId: string;
  requester: {
    _id: Types.ObjectId;
    roles: Array<"customer" | "staff" | "owner" | "admin" | "moderator">;
  };
}): Promise<IBooking> => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");

  const business = await Business.findById(booking.businessId);
  const isBusinessOwner =
    business !== null && String(business.ownerId) === String(requester._id);

  if (!isBusinessOwner) {
    throw new ApiError(
      403,
      "Only the shop owner or linked independent barber can confirm payment",
    );
  }
  if (booking.status !== "pending") {
    throw new ApiError(
      400,
      "Payment can only be confirmed for pending bookings",
    );
  }
  if (!booking.paymentScreenshotUrl) {
    throw new ApiError(400, "Payment screenshot is required");
  }

  const { refreshVerifyEtStatus } = await import("./bookingPaymentVerify.service");
  return refreshVerifyEtStatus(bookingId);
};

export const verifyBookingPayment = async (
  bookingId: string,
  ownerId: Types.ObjectId | string,
): Promise<IBooking> => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");

  const business = await Business.findById(booking.businessId);
  if (!business) throw new ApiError(404, "Business not found");

  if (String(business.ownerId) !== String(ownerId)) {
    throw new ApiError(403, "Not allowed to confirm this payment");
  }

  if (booking.status !== "pending") {
    throw new ApiError(400, "Payment can only be confirmed for pending bookings");
  }

  if (!booking.paymentScreenshotUrl) {
    throw new ApiError(400, "Payment screenshot is required");
  }

  // Manual owner confirm is retired — only Verify.ET (or cash checkout) can mark paid.
  const { refreshVerifyEtStatus } = await import("./bookingPaymentVerify.service");
  return refreshVerifyEtStatus(bookingId);
};

const upsertWalkInClient = async ({
  businessId,
  fullName,
  phoneNumber,
  email,
  notes,
}: {
  businessId: string;
  fullName?: string;
  phoneNumber: string;
  email?: string;
  notes?: string;
}) => {
  const normalizedPhone = phoneNumber.trim();
  const normalizedEmail = email?.trim().toLowerCase();

  const linkedUser = await User.findOne({ phoneNumber: normalizedPhone }).lean();
  const existingClient = await Client.findOne({ businessId, phoneNumber: normalizedPhone });

  if (existingClient) {
    existingClient.fullName = fullName || existingClient.fullName;
    if (normalizedEmail) existingClient.email = normalizedEmail;
    if (notes !== undefined) existingClient.notes = notes;
    existingClient.lastVisit = new Date();
    await existingClient.save();
    return {
      userId: linkedUser ? String(linkedUser._id) : String(existingClient._id),
      clientId: existingClient._id,
      client: existingClient,
    };
  }

  const createdClient = await Client.create({
    businessId,
    fullName: fullName || linkedUser?.fullName || "Walk-in Client",
    phoneNumber: normalizedPhone,
    email: normalizedEmail || linkedUser?.email,
    notes,
    totalSpend: 0,
    lastVisit: new Date(),
  });

  return {
    userId: linkedUser ? String(linkedUser._id) : String(createdClient._id),
    clientId: createdClient._id,
    client: createdClient,
  };
};

export const createWalkInBooking = async ({
  businessId,
  serviceIds,
  staffPlan,
  startTime,
  endTime,
  paymentMethod,
  userLat,
  userLng,
  fullName,
  phoneNumber,
  email,
  notes,
}: {
  businessId: string;
  serviceIds: string[];
  staffPlan: Array<{
    staffId: string;
    serviceId: string;
    startTime: string;
    endTime: string;
  }>;
  startTime: string;
  endTime: string;
  paymentMethod?: "cash" | "in-shop";
  userLat?: number;
  userLng?: number;
  fullName?: string;
  phoneNumber: string;
  email?: string;
  notes?: string;
}): Promise<IBooking> => {
  if (!phoneNumber?.trim()) {
    throw new ApiError(400, "phoneNumber is required for walk-in bookings");
  }

  const clientLink = await upsertWalkInClient({
    businessId,
    fullName,
    phoneNumber,
    email,
    notes,
  });

  const booking = await createBooking({
    userId: clientLink.userId,
    businessId,
    serviceIds,
    userLat,
    userLng,
    staffPlan,
    startTime,
    endTime,
    paymentMethod,
    isWalkIn: true,
    clientId: clientLink.clientId,
    forceConfirmed: true,
  });

  booking.status = "confirmed";
  booking.isWalkIn = true;
  booking.clientId = clientLink.clientId;
  booking.userId = clientLink.userId;
  await booking.save();
  return booking;
};

export const checkoutBooking = async ({
  bookingId,
  ownerId,
  products,
  priceOverride,
  paymentMethod,
  tip,
}: {
  bookingId: string;
  ownerId: Types.ObjectId;
  products: Array<{ productId: string; quantity: number }>;
  priceOverride?: number;
  paymentMethod: "cash" | "in-shop";
  tip?: number;
}): Promise<IBooking> => {
  const session = await bookingSession();
  try {
    const result = await bookingTransaction(session, async () => {
      const booking = await Booking.findById(bookingId)
        .populate("serviceIds", "name basePrice")
        .populate("serviceId", "name basePrice")
        .session(session);
      if (!booking) throw new ApiError(404, "Booking not found");

      const business = await Business.findById(booking.businessId).session(session);
      if (!business) throw new ApiError(404, "Business not found");
      if (String(business.ownerId) !== String(ownerId)) {
        throw new ApiError(403, "Not allowed to checkout this booking");
      }
      if (booking.paymentStatus === "paid") {
        throw new ApiError(409, "This booking has already been paid");
      }
      if (["cancelled", "expired", "no-show", "no_show"].includes(booking.status)) {
        throw new ApiError(409, "This booking cannot be checked out in its current status");
      }

      const serviceDocs = Array.isArray(booking.serviceIds)
        ? (booking.serviceIds as Array<{ basePrice?: number; name?: string }>)
        : [];
      const serviceTotal = booking.servicePriceSnapshots?.length ? booking.servicePriceSnapshots.reduce((sum, item) => sum + item.unitPrice, 0) : serviceDocs.reduce(
        (sum, svc) => sum + (Number(svc?.basePrice) || 0),
        0,
      );

      const productIds = products.map((item) => String(item.productId));
      const productDocs = await Product.find({
        _id: { $in: productIds },
        businessId: booking.businessId,
      }).session(session);

      if (productDocs.length !== productIds.length) {
        throw new ApiError(404, "One or more products were not found");
      }

      const productMap = new Map(productDocs.map((doc) => [String(doc._id), doc]));
      const checkoutItems = products.map((item) => {
        const product = productMap.get(String(item.productId));
        if (!product) throw new ApiError(404, "One or more products were not found");
        if (product.stockQuantity < item.quantity) {
          throw new ApiError(400, `Insufficient stock for ${product.name}`);
        }
        return {
          productId: product._id,
          quantity: item.quantity,
          unitPrice: product.price,
          name: product.name,
        };
      });

      for (const item of checkoutItems) {
        const updated = await Product.findOneAndUpdate(
          {
            _id: item.productId,
            businessId: booking.businessId,
            stockQuantity: { $gte: item.quantity },
          },
          { $inc: { stockQuantity: -item.quantity } },
          { new: true, session },
        );
        if (!updated) {
          throw new ApiError(400, `Insufficient stock for ${item.name}`);
        }
      }

      const productTotal = checkoutItems.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0,
      );
      const tipAmount = typeof tip === "number" && tip > 0 ? tip : 0;
      const totalAmount =
        typeof priceOverride === "number"
          ? Math.max(0, priceOverride)
          : serviceTotal + productTotal + tipAmount;

      booking.checkoutItems = checkoutItems as any;
      booking.priceOverride = priceOverride;
      booking.tipAmount = tipAmount;
      booking.totalAmount = totalAmount;
      booking.paymentMethod = paymentMethod;
      booking.paymentStatus = "paid";
      booking.status = "confirmed";
      booking.paidAt = new Date();
      if (booking.startTime <= new Date()) booking.completedAt = booking.completedAt || new Date();
      await booking.save({ session });

      const client = booking.clientId
        ? await Client.findById(booking.clientId).session(session)
        : null;
      if (client) {
        client.totalSpend = (client.totalSpend || 0) + totalAmount;
        client.lastVisit = new Date();
        await client.save({ session });
      }

      return booking;
    });

    await afterOfflineCommit(() => queueBookingNotifications(result));
    return result;
  } finally {
    await finishBookingSession(session);
  }
};

export const updateBookingAppointment = async ({
  bookingId,
  businessId,
  ownerId,
  appointmentNotes,
  serviceIds,
  tipAmount,
}: {
  bookingId: string;
  businessId: string;
  ownerId: Types.ObjectId;
  appointmentNotes?: string;
  serviceIds?: string[];
  tipAmount?: number;
}): Promise<IBooking> => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");
  if (String(booking.businessId) !== businessId) {
    throw new ApiError(403, "Booking does not belong to this business");
  }

  const business = await Business.findById(businessId);
  if (!business) throw new ApiError(404, "Business not found");
  if (String(business.ownerId) !== String(ownerId)) {
    throw new ApiError(403, "Not allowed to update this booking");
  }
  if (booking.paymentStatus === "paid") {
    throw new ApiError(400, "Cannot edit a paid booking");
  }

  if (appointmentNotes !== undefined) {
    booking.appointmentNotes = appointmentNotes;
  }
  if (typeof tipAmount === "number" && tipAmount >= 0) {
    booking.tipAmount = tipAmount;
  }

  if (serviceIds && serviceIds.length > 0) {
    const services = await Service.find({
      _id: { $in: serviceIds },
      businessId,
    });
    if (services.length !== serviceIds.length) {
      throw new ApiError(404, "One or more services were not found");
    }

    const staffId = String(booking.staffId);
    let cursor = new Date(booking.startTime);
    const staffPlan = services.map((service) => {
      const startTime = new Date(cursor);
      const endTime = new Date(
        startTime.getTime() + Number(service.duration || 30) * 60 * 1000,
      );
      cursor = endTime;
      return {
        staffId,
        serviceId: service._id,
        startTime,
        endTime,
      };
    });

    booking.serviceIds = serviceIds.map((id) => new Types.ObjectId(id));
    booking.serviceId = booking.serviceIds[0];
    booking.staffPlan = staffPlan as any;
    booking.endTime = staffPlan[staffPlan.length - 1].endTime;
    booking.totalAmount =
      services.reduce((sum, s) => sum + Number(s.basePrice || 0), 0) +
      Number(booking.tipAmount || 0);
  }

  await booking.save();
  return booking.populate("serviceIds", "name basePrice duration category categoryName");
};

export const buildReceiptText = async (bookingId: string): Promise<string> => {
  const booking = await Booking.findById(bookingId)
    .populate("serviceIds", "name basePrice")
    .populate("serviceId", "name basePrice")
    .populate("clientId", "fullName phoneNumber")
    .lean();

  if (!booking) throw new ApiError(404, "Booking not found");

  const business = await Business.findById(booking.businessId).lean();
  if (!business) throw new ApiError(404, "Business not found");

  const serviceDocs = (Array.isArray(booking.serviceIds) && booking.serviceIds.length
    ? booking.serviceIds : booking.serviceId ? [booking.serviceId] : []) as unknown as Array<{ _id?: unknown; name?: string; basePrice?: number }>;
  const lines = serviceDocs.map((service) => ({
    name: String(service.name || "Service"),
    quantity: 1,
    unitPrice: booking.servicePriceSnapshots?.find(snapshot => String(snapshot.serviceId) === String(service._id))?.unitPrice ?? (Number(service.basePrice) || 0),
  }));

  const checkoutItems = Array.isArray((booking as { checkoutItems?: Array<{ name?: string; quantity?: number; unitPrice?: number }> }).checkoutItems)
    ? (booking as { checkoutItems: Array<{ name?: string; quantity?: number; unitPrice?: number }> }).checkoutItems
    : [];

  for (const item of checkoutItems) {
    lines.push({
      name: String(item.name || "Product"),
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
    });
  }

  const difference = Math.round((booking.totalAmount - lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)) * 100) / 100;
  if (difference !== 0) lines.push({ name: "Other booking charges / adjustment", quantity: 1, unitPrice: difference });

  const receipt = formatReceipt({
    merchantName: String(business.name),
    date: new Date(booking.paidAt || (booking as { createdAt?: Date }).createdAt || new Date()),
    reference: `ELV-R-${String(booking._id).toUpperCase()}`,
    bookingReference: String(booking._id),
    paymentMethod: booking.paymentMethod,
    customerName: String(
      (booking as { clientId?: { fullName?: string } }).clientId?.fullName ||
        "",
    ),
    lines,
    total: Number(booking.totalAmount || 0),
  });

  return receipt;
};

export const autoMarkNoShows = async ({
  graceMinutes = 15,
}: {
  graceMinutes?: number;
} = {}): Promise<number> => {
  const now = new Date();
  const threshold = new Date(now.getTime() - graceMinutes * 60 * 1000);

  const overdue = await Booking.find(
    {
      status: "confirmed",
      startTime: { $lte: threshold },
    },
    { _id: 1, userId: 1 },
  ).lean();

  if (overdue.length === 0) return 0;

  const bookingIds = overdue.map((item) => item._id);
  const userCounts = new Map<string, number>();
  for (const row of overdue) {
    const userId = String(row.userId);
    userCounts.set(userId, (userCounts.get(userId) || 0) + 1);
  }

  await Booking.updateMany(
    { _id: { $in: bookingIds } },
    {
      $set: {
        status: "no-show",
        noShowMarkedAt: now,
        cancellationReason: "No-show (auto)",
      },
    },
  );

  await Promise.all(
    [...userCounts.entries()].map(([userId, count]) =>
      User.findByIdAndUpdate(userId, { $inc: { noShowCount: count } }),
    ),
  );

  return overdue.length;
};

export { getAvailableSlots } from "./availability.service";
