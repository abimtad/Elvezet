import { Types } from "mongoose";
import Availability from "../models/Availability";
import Business from "../models/Business";
import Review from "../models/Review";
import StaffProfile from "../models/StaffProfile";
import User from "../models/User";
import ApiError from "../utils/ApiError";
import { calculateHaversineDistance } from "../utils/distance.utils";
import { IBusiness } from "../models/Business";
import { toPublicUrl } from "./media.service";

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type WeeklyScheduleEntry = {
  dayOfWeek: number;
  dayLabel: string;
  hours: string;
  isClosed: boolean;
};

export type BusinessPresentation = Record<string, unknown> & {
  reviewCount: number;
  reviewCountLabel: string;
  distanceKm?: number;
  distanceLabel?: string;
  primaryCategory?: string;
  weeklySchedule?: WeeklyScheduleEntry[];
  openUntil?: string;
};

const formatReviewCountLabel = (count: number): string => {
  if (count >= 1000) {
    return `(${Math.round(count / 100) / 10}k)`;
  }
  return `(${count})`;
};

const formatDistanceLabel = (km?: number): string | undefined => {
  if (typeof km !== "number" || Number.isNaN(km)) return undefined;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
};

const resolveMediaUrl = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) return "";
  return toPublicUrl(value.trim());
};

const minutesTo12h = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
};

const toMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const formatHours = (start: string, end: string): string =>
  `${minutesTo12h(toMinutes(start))} - ${minutesTo12h(toMinutes(end))}`;

const buildWeeklySchedule = async (
  business: Pick<
    IBusiness,
    "_id" | "type" | "ownerId" | "openingTime" | "closingTime" | "weeklySchedule"
  >,
): Promise<WeeklyScheduleEntry[]> => {
  if (Array.isArray(business.weeklySchedule) && business.weeklySchedule.length) {
    const byDay = new Map(
      business.weeklySchedule.map((entry) => [Number(entry.dayOfWeek), entry]),
    );

    return DAY_LABELS.map((dayLabel, dayOfWeek) => {
      const entry = byDay.get(dayOfWeek);
      const isClosed = !entry || entry.isOpen === false;
      return {
        dayOfWeek,
        dayLabel,
        hours:
          isClosed || !entry.openingTime || !entry.closingTime
            ? "Closed"
            : formatHours(entry.openingTime, entry.closingTime),
        isClosed,
      };
    });
  }

  const businessId = String(business._id);
  const staffProfiles = await StaffProfile.find({
    businessId,
    isActive: true,
  })
    .select("staffId")
    .lean();

  let staffIds = staffProfiles.map((row) => String(row.staffId));

  if (business.type === "independent" && business.ownerId) {
    const owner = await User.findById(business.ownerId).select("firebaseUid").lean();
    if (owner?.firebaseUid && !staffIds.includes(String(owner.firebaseUid))) {
      staffIds = [String(owner.firebaseUid), ...staffIds];
    }
  }

  const fallbackHours =
    business.openingTime && business.closingTime
      ? formatHours(String(business.openingTime), String(business.closingTime))
      : "Hours not set";

  if (!staffIds.length) {
    return DAY_LABELS.map((dayLabel, dayOfWeek) => ({
      dayOfWeek,
      dayLabel,
      hours: dayOfWeek === 0 ? "Closed" : fallbackHours,
      isClosed: dayOfWeek === 0,
    }));
  }

  const rows = await Availability.find({ staffId: { $in: staffIds } }).lean();

  const byDay = new Map<number, Array<{ start: number; end: number }>>();
  for (const row of rows) {
    const day = Number(row.dayOfWeek);
    const list = byDay.get(day) || [];
    list.push({
      start: toMinutes(String(row.startTime)),
      end: toMinutes(String(row.endTime)),
    });
    byDay.set(day, list);
  }

  return DAY_LABELS.map((dayLabel, dayOfWeek) => {
    const intervals = byDay.get(dayOfWeek) || [];
    if (!intervals.length) {
      const isSunday = dayOfWeek === 0;
      return {
        dayOfWeek,
        dayLabel,
        hours: isSunday ? "Closed" : fallbackHours,
        isClosed: isSunday,
      };
    }

    const start = Math.min(...intervals.map((i) => i.start));
    const end = Math.max(...intervals.map((i) => i.end));
    return {
      dayOfWeek,
      dayLabel,
      hours: `${minutesTo12h(start)} - ${minutesTo12h(end)}`,
      isClosed: false,
    };
  });
};

const openingHoursMapFromSchedule = (
  schedule: WeeklyScheduleEntry[],
): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const entry of schedule) {
    map[entry.dayLabel] = entry.hours;
  }
  return map;
};

export const attachReviewCounts = async (
  businesses: Array<Record<string, unknown>>,
): Promise<Map<string, number>> => {
  const ids = businesses
    .map((b) => String(b._id || ""))
    .filter(Boolean);

  if (!ids.length) return new Map();

  const objectIds = ids
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  const grouped = await Review.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { businessId: { $in: objectIds }, isHidden: { $ne: true } } },
    { $group: { _id: "$businessId", count: { $sum: 1 } } },
  ]);

  const map = new Map<string, number>();
  for (const row of grouped) {
    map.set(String(row._id), row.count);
  }
  return map;
};

export const presentBusiness = (
  business: Record<string, unknown>,
  options: {
    reviewCount?: number;
    distanceKm?: number;
    weeklySchedule?: WeeklyScheduleEntry[];
    primaryCategory?: string;
    includePrivate?: boolean;
  } = {},
): BusinessPresentation => {
  const reviewCount = options.reviewCount ?? 0;
  const weeklySchedule = options.weeklySchedule;
  const openingHours = weeklySchedule
    ? openingHoursMapFromSchedule(weeklySchedule)
    : undefined;

  const closingTime = String(business.closingTime || "18:00");
  const openUntil = minutesTo12h(toMinutes(closingTime));

  const galleryUrls = Array.isArray(business.galleryUrls)
    ? business.galleryUrls.map((url) => resolveMediaUrl(url)).filter(Boolean)
    : [];

  const imageUrl =
    resolveMediaUrl(business.coverImageUrl) ||
    resolveMediaUrl(business.logoUrl) ||
    "";

  // Keep logo/cover as submitted. Do not promote gallery into main cover —
  // clients show a default main image when these are empty.
  const logoUrl = resolveMediaUrl(business.logoUrl) || "";
  const coverImageUrl = resolveMediaUrl(business.coverImageUrl) || "";
  const publicBusiness = { ...business };
  if (!options.includePrivate) {
    for (const field of ["idCardUrl", "idNumber", "homeLocation"]) delete publicBusiness[field];
  }

  return {
    ...publicBusiness,
    genderTarget: publicBusiness.genderTarget || "unknown",
    audienceNeedsReview: !publicBusiness.genderTarget || publicBusiness.genderTarget === "unknown",
    galleryUrls,
    imageUrl,
    logoUrl,
    coverImageUrl,
    reviewCount,
    reviewCountLabel: formatReviewCountLabel(reviewCount),
    distanceKm: options.distanceKm,
    distanceLabel: formatDistanceLabel(options.distanceKm),
    primaryCategory:
      options.primaryCategory ||
      (typeof business.businessCategoryName === "string"
        ? business.businessCategoryName
        : undefined),
    weeklySchedule,
    openingHours,
    openUntil,
  };
};

export const presentBusinessList = async (
  businesses: Array<Record<string, unknown>>,
  options: {
    lat?: number;
    lng?: number;
  } = {},
): Promise<BusinessPresentation[]> => {
  const reviewMap = await attachReviewCounts(businesses);

  return businesses.map((business) => {
    const id = String(business._id || "");
    let distanceKm: number | undefined;

    if (
      typeof options.lat === "number" &&
      typeof options.lng === "number" &&
      business.location &&
      typeof business.location === "object" &&
      Array.isArray((business.location as { coordinates?: number[] }).coordinates)
    ) {
      const coords = (business.location as { coordinates: number[] }).coordinates;
      distanceKm = Number(
        calculateHaversineDistance(
          { latitude: options.lat, longitude: options.lng },
          { latitude: coords[1], longitude: coords[0] },
        ).toFixed(2),
      );
    }

    return presentBusiness(business, {
      reviewCount: reviewMap.get(id) ?? 0,
      distanceKm,
      primaryCategory:
        typeof business.businessCategoryName === "string"
          ? business.businessCategoryName
          : undefined,
    });
  });
};

export const getBusinessDetailPresentation = async (
  businessId: string,
  options: { lat?: number; lng?: number; requesterId?: string; canModerate?: boolean } = {},
): Promise<BusinessPresentation> => {
  const business = await Business.findById(businessId).lean();
  if (!business) throw new ApiError(404, "Business not found");
  const includePrivate = options.requesterId === String(business.ownerId) || options.canModerate === true;
  if ((business.isVisible === false || business.verificationStatus === "suspended") && !includePrivate) throw new ApiError(404, "Business not found");

  const weeklySchedule = await buildWeeklySchedule(
    business as Pick<
      IBusiness,
      "_id" | "type" | "ownerId" | "openingTime" | "closingTime" | "weeklySchedule"
    >,
  );

  const reviewCount = await Review.countDocuments({ businessId, isHidden: { $ne: true } });
  let distanceKm: number | undefined;
  if (
    typeof options.lat === "number" &&
    typeof options.lng === "number" &&
    business.location?.coordinates
  ) {
    const [lng, lat] = business.location.coordinates;
    distanceKm = Number(
      calculateHaversineDistance(
        { latitude: options.lat, longitude: options.lng },
        { latitude: lat, longitude: lng },
      ).toFixed(2),
    );
  }

  return presentBusiness(business as unknown as Record<string, unknown>, {
    reviewCount,
    distanceKm,
    weeklySchedule,
    primaryCategory: business.businessCategoryName,
    includePrivate,
  });
};
