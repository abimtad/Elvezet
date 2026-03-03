import { Types } from "mongoose";
import env from "../config/env";
import Business, { IBusiness } from "../models/Business";
import Category from "../models/Category";
import Service from "../models/Service";
import ApiError from "../utils/ApiError";
import {
  applyBarberRounding,
  calculateHaversineDistance,
} from "../utils/distance.utils";
import { invalidatePublicBusinessCache, getCachedJson, setCachedJson } from "./cache.service";
import { deleteLocalFile } from "./media.service";
import {
  BusinessPresentation,
  getBusinessDetailPresentation,
  presentBusinessList,
} from "./businessPresentation.service";

export type BusinessListFilters = {
  lat?: number;
  lng?: number;
  radiusKm?: number;
  gender?: "male" | "female" | "all";
  type?: "shop" | "independent";
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  q?: string;
  category?: string;
  muslimFriendly?: boolean;
};

const ALLOWED_MUSLIM_AMENITIES = new Set([
  "women_only_hours",
  "same_gender_staff",
  "hijab_friendly",
  "private_rooms",
  "wudu_available",
  "family_area",
  "prayer_space",
]);

export type BusinessQuoteInput = {
  userLat: number;
  userLng: number;
  serviceIds: string[];
};

export type BusinessQuoteResult = {
  basePrice: number;
  travelFee: number;
  totalPrice: number;
  distance: number;
  isAllowed: true;
};

const businessCacheKey = (filters: BusinessListFilters): string => {
  return `businesses:list:privacy-v2:${JSON.stringify(filters)}`;
};

const normalizePriceRange = (
  minPrice?: number,
  maxPrice?: number,
): Record<string, number> | undefined => {
  if (typeof minPrice !== "number" && typeof maxPrice !== "number") {
    return undefined;
  }

  const range: Record<string, number> = {};
  if (typeof minPrice === "number") range.$gte = minPrice;
  if (typeof maxPrice === "number") range.$lte = maxPrice;
  return range;
};

const getHomeLocationCoordinates = (
  business: Pick<IBusiness, "homeLocation" | "location">,
): [number, number] => {
  return (business.homeLocation || business.location).coordinates;
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeCategoryName = (value?: unknown): string =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");

type BusinessWeeklyScheduleEntry = {
  dayOfWeek: number;
  isOpen: boolean;
  openingTime?: string;
  closingTime?: string;
};

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const normalizeWeeklySchedule = (
  value: unknown,
  masterOpeningTime: string,
  masterClosingTime: string,
): BusinessWeeklyScheduleEntry[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];

  const masterOpen = toMinutes(masterOpeningTime);
  const masterClose = toMinutes(masterClosingTime);
  const byDay = new Map<number, BusinessWeeklyScheduleEntry>();

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as {
      dayOfWeek?: unknown;
      isOpen?: unknown;
      openingTime?: unknown;
      closingTime?: unknown;
    };
    const dayOfWeek = Number(entry.dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) continue;

    const isOpen = Boolean(entry.isOpen);
    if (!isOpen) {
      byDay.set(dayOfWeek, { dayOfWeek, isOpen: false });
      continue;
    }

    const openingTime = String(entry.openingTime || "").trim();
    const closingTime = String(entry.closingTime || "").trim();
    const opening = toMinutes(openingTime);
    const closing = toMinutes(closingTime);

    if (
      !openingTime ||
      !closingTime ||
      opening < masterOpen ||
      closing > masterClose ||
      opening >= closing
    ) {
      throw new ApiError(400, "Weekly business hours must fall within master business hours");
    }

    byDay.set(dayOfWeek, {
      dayOfWeek,
      isOpen: true,
      openingTime,
      closingTime,
    });
  }

  return [...byDay.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
};

const resolveBusinessCategoryFields = async (input: {
  businessCategoryId?: unknown;
  businessCategoryName?: unknown;
}): Promise<{
  businessCategoryId?: Types.ObjectId;
  businessCategoryName?: string;
}> => {
  if (input.businessCategoryId) {
    const category = await Category.findById(String(input.businessCategoryId));
    if (!category) throw new ApiError(404, "Business category not found");
    if (!category.isActive) throw new ApiError(400, "Business category is inactive");
    return {
      businessCategoryId: category._id,
      businessCategoryName: category.name,
    };
  }

  const name = normalizeCategoryName(input.businessCategoryName);
  if (!name) return {};

  const category = await Category.findOne({
    name: new RegExp(`^${escapeRegExp(name)}$`, "i"),
    isActive: true,
  });

  if (!category) {
    throw new ApiError(404, "Business category not found");
  }

  return {
    businessCategoryId: category._id,
    businessCategoryName: category.name,
  };
};

export const calculateBusinessQuote = async (
  businessId: string,
  input: BusinessQuoteInput,
): Promise<BusinessQuoteResult> => {
  const business = await Business.findById(businessId).lean();
  if (!business) {
    throw new ApiError(404, "Business not found");
  }

  const services = await Service.find({
    _id: { $in: input.serviceIds },
    businessId,
  })
    .select("basePrice")
    .lean();

  if (services.length !== input.serviceIds.length) {
    throw new ApiError(
      404,
      "One or more services were not found for this business",
    );
  }

  return calculateQuoteForBusiness(business as IBusiness, services, input);
};

/** Reuse the transaction's business/services instead of reading them twice. */
export const calculateQuoteForBusiness = (
  business: Pick<IBusiness, "homeLocation" | "location" | "maxTravelDistance" | "bufferRange" | "minTravelFee" | "travelRate">,
  services: Array<{ basePrice: number }>,
  input: BusinessQuoteInput,
): BusinessQuoteResult => {
  const basePrice = services.reduce(
    (sum, service) => sum + (Number(service.basePrice) || 0),
    0,
  );

  const [homeLongitude, homeLatitude] = getHomeLocationCoordinates(
    business as Pick<IBusiness, "homeLocation" | "location">,
  );
  const distance = calculateHaversineDistance(
    { latitude: input.userLat, longitude: input.userLng },
    { latitude: homeLatitude, longitude: homeLongitude },
  );

  const maxTravelDistance = Number(
    (business as { maxTravelDistance?: number }).maxTravelDistance ?? 0,
  );
  if (maxTravelDistance > 0 && distance > maxTravelDistance) {
    throw new ApiError(400, "Outside service area");
  }

  const bufferRange = Number((business as { bufferRange?: number }).bufferRange ?? 0);
  const minTravelFee = Number((business as { minTravelFee?: number }).minTravelFee ?? 0);
  const travelRate = Number((business as { travelRate?: number }).travelRate ?? 0);

  let travelFee = 0;
  if (distance > bufferRange) {
    const extraKm = distance - bufferRange;
    const rawTravelFee = minTravelFee + Math.max(0, extraKm - 1) * travelRate;
    travelFee = applyBarberRounding(rawTravelFee);
  }

  const totalPrice = applyBarberRounding(basePrice + travelFee);

  return {
    basePrice,
    travelFee,
    totalPrice,
    distance: Number(distance.toFixed(2)),
    isAllowed: true,
  };
};

export const listBusinesses = async (
  filters: BusinessListFilters = {},
): Promise<BusinessPresentation[]> => {
  const cacheKey = businessCacheKey(filters);
  const cached = await getCachedJson<BusinessPresentation[]>(cacheKey);
  if (cached) return cached;

  const query: Record<string, unknown> = {};

  if (filters.gender) query.genderTarget = filters.gender === "all" ? "all" : { $in: [filters.gender, "all"] };
  if (filters.type) query.type = filters.type;
  if (filters.muslimFriendly === true) {
    query.muslimFriendlyEnabled = true;
  }
  query.isVisible = true;
  const priceRange = normalizePriceRange(filters.minPrice, filters.maxPrice);
  if (priceRange) {
    query.averagePrice = priceRange;
  }

  if (typeof filters.minRating === "number" && filters.minRating > 0) {
    query.rating = { $gte: filters.minRating };
  }

  const andClauses: Array<Record<string, unknown>> = [];

  const normalizedQuery = filters.q?.trim();
  if (normalizedQuery) {
    const textRegex = {
      $regex: escapeRegExp(normalizedQuery),
      $options: "i",
    };
    andClauses.push({
      $or: [
        { name: textRegex },
        { addressString: textRegex },
        { businessCategoryName: textRegex },
        { description: textRegex },
      ],
    });
  }

  const normalizedCategory = normalizeCategoryName(filters.category);
  const categoryKey = normalizedCategory.toLowerCase();
  if (
    normalizedCategory &&
    categoryKey !== "all" &&
    categoryKey !== "muslim"
  ) {
    const category = await Category.findOne({
      name: new RegExp(`^${escapeRegExp(normalizedCategory)}$`, "i"),
      isActive: true,
    }).lean();

    if (!category) return [];

    andClauses.push({
      $or: [
        { businessCategoryId: category._id },
        {
          businessCategoryName: new RegExp(
            `^${escapeRegExp(String(category.name))}$`,
            "i",
          ),
        },
      ],
    });
  } else if (categoryKey === "muslim") {
    query.muslimFriendlyEnabled = true;
  }

  // Nest text/category matchers under $and so they coexist with $near.
  if (andClauses.length > 0) {
    query.$and = andClauses;
  }

  let businesses: Array<Record<string, unknown>> = [];

  if (typeof filters.lat === "number" && typeof filters.lng === "number") {
    const nearQuery: Record<string, unknown> = {
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [filters.lng, filters.lat] },
          $maxDistance: (filters.radiusKm ?? 5) * 1000,
        },
      },
      ...query,
    };
    businesses = (await Business.find(nearQuery).lean()) as unknown as Array<
      Record<string, unknown>
    >;
  } else {
    businesses = (await Business.find(query)
      .sort({ createdAt: -1 })
      .lean()) as unknown as Array<Record<string, unknown>>;
  }

  const presented = await presentBusinessList(businesses, {
    lat: filters.lat,
    lng: filters.lng,
  });

  await setCachedJson(cacheKey, presented, env.CACHE_TTL_SECONDS);
  return presented;
};

export const recalculateBusinessAveragePrice = async (
  businessId: string,
): Promise<number> => {
  const services = await Service.find({ businessId, isActive: { $ne: false } }).select("basePrice").lean();

  if (!services.length) {
    await Business.findByIdAndUpdate(businessId, { averagePrice: 0 });
    await invalidatePublicBusinessCache();
    return 0;
  }

  const prices = services.map((service) => Number(service.basePrice) || 0);
  const total = prices.reduce((sum, price) => sum + price, 0);
  const average = Number((total / services.length).toFixed(2));

  await Business.findByIdAndUpdate(businessId, { averagePrice: average });
  await invalidatePublicBusinessCache();
  return average;
};

export const updateBusiness = async (
  businessId: string,
  updates: Record<string, unknown>,
  requesterId: Types.ObjectId,
): Promise<IBusiness> => {
  const business = await Business.findById(businessId);
  if (!business) throw new ApiError(404, "Business not found");
  if (String(business.ownerId) !== String(requesterId)) {
    throw new ApiError(403, "You do not own this business");
  }
  const previousLogoUrl = business.logoUrl;
  const previousCoverImageUrl = business.coverImageUrl;

  if (updates.name !== undefined) business.name = String(updates.name);
  if (updates.description !== undefined) business.description = String(updates.description);
  if (updates.mediaLinks !== undefined) {
    business.mediaLinks = Array.isArray(updates.mediaLinks)
      ? (updates.mediaLinks as string[])
      : [];
  }
  if (updates.galleryUrls !== undefined) {
    business.galleryUrls = Array.isArray(updates.galleryUrls)
      ? (updates.galleryUrls as string[])
      : [];
  }
  if (updates.logoUrl !== undefined) {
    const nextLogoUrl = String(updates.logoUrl || "").trim() || undefined;
    business.logoUrl = nextLogoUrl;
  }
  if (updates.coverImageUrl !== undefined) {
    const nextCoverImageUrl = String(updates.coverImageUrl || "").trim() || undefined;
    business.coverImageUrl = nextCoverImageUrl;
  }
  if (updates.instagramUrl !== undefined) {
    business.instagramUrl = String(updates.instagramUrl || "").trim() || undefined;
  }
  if (updates.tiktokUrls !== undefined) {
    business.tiktokUrls = Array.isArray(updates.tiktokUrls)
      ? (updates.tiktokUrls as string[])
      : [];
  }
  if (updates.addressString !== undefined) business.addressString = String(updates.addressString);
  if (
    updates.businessCategoryId !== undefined ||
    updates.businessCategoryName !== undefined
  ) {
    const resolvedCategory = await resolveBusinessCategoryFields({
      businessCategoryId: updates.businessCategoryId,
      businessCategoryName: updates.businessCategoryName,
    });
    business.businessCategoryId = resolvedCategory.businessCategoryId;
    business.businessCategoryName = resolvedCategory.businessCategoryName;
  }
  if (updates.type !== undefined) {
    business.type = String(updates.type) as "shop" | "independent";
  }
  if (typeof updates.isVisible === "boolean") {
    business.isVisible = updates.isVisible;
  }
  if (typeof updates.bufferRange === "number") business.bufferRange = updates.bufferRange;
  if (typeof updates.cancellationWindowMinutes === "number") business.cancellationWindowMinutes = updates.cancellationWindowMinutes;
  if (typeof updates.slotInterval === "number") business.slotInterval = updates.slotInterval;
  if (typeof updates.bookingBufferMinutes === "number") business.bookingBufferMinutes = updates.bookingBufferMinutes;
  if (typeof updates.minimumNoticeMinutes === "number") business.minimumNoticeMinutes = updates.minimumNoticeMinutes;
  if (typeof updates.requirePrepayment === "boolean") {
    business.requirePrepayment = updates.requirePrepayment;
  }
  if (typeof updates.muslimFriendlyEnabled === "boolean") {
    business.muslimFriendlyEnabled = updates.muslimFriendlyEnabled;
    if (!updates.muslimFriendlyEnabled) {
      business.muslimAmenities = [];
    }
  }
  if (updates.muslimAmenities !== undefined) {
    const raw = Array.isArray(updates.muslimAmenities)
      ? updates.muslimAmenities
      : [];
    business.muslimAmenities = [
      ...new Set(
        raw
          .map((item) => String(item))
          .filter((item) => ALLOWED_MUSLIM_AMENITIES.has(item)),
      ),
    ];
  }
  if (updates.settlementAccount !== undefined) {
    business.settlementAccount =
      String(updates.settlementAccount || "").trim() || undefined;
  }
  if (updates.settlementBank !== undefined) {
    business.settlementBank =
      String(updates.settlementBank || "").trim() || undefined;
  }
  if (updates.paymentInstructions !== undefined) {
    business.paymentInstructions =
      String(updates.paymentInstructions || "").trim() || undefined;
  }
  if (typeof updates.travelRate === "number") business.travelRate = updates.travelRate;
  if (typeof updates.minTravelFee === "number") business.minTravelFee = updates.minTravelFee;
  if (typeof updates.maxTravelDistance === "number") business.maxTravelDistance = updates.maxTravelDistance;
  if (updates.homeLocation !== undefined) {
    business.homeLocation = updates.homeLocation as {
      type: "Point";
      coordinates: [number, number];
    };
  }
  if (updates.genderTarget !== undefined) {
    business.genderTarget = String(updates.genderTarget) as
      | "male"
      | "female";
  }
  if (typeof updates.averagePrice === "number") {
    business.averagePrice = updates.averagePrice;
  }

  if (typeof updates.longitude === "number" && typeof updates.latitude === "number") {
    const previousCoordinates = business.location.coordinates;
    const homeTracksLocation = !business.homeLocation ||
      business.homeLocation.coordinates.every((value, index) => value === previousCoordinates[index]);
    business.location = { type: "Point", coordinates: [updates.longitude as number, updates.latitude as number] } as any;
    if (updates.homeLocation === undefined && homeTracksLocation) {
      business.homeLocation = { type: "Point", coordinates: [updates.longitude, updates.latitude] };
    }
  }
  if (updates.openingTime !== undefined) {
    business.openingTime = String(updates.openingTime);
  }
  if (updates.closingTime !== undefined) {
    business.closingTime = String(updates.closingTime);
  }
  if (updates.weeklySchedule !== undefined) {
    business.weeklySchedule = normalizeWeeklySchedule(
      updates.weeklySchedule,
      business.openingTime,
      business.closingTime,
    ) as any;
  }
  await business.save();
  for (const [previous, current] of [
    [previousLogoUrl, business.logoUrl],
    [previousCoverImageUrl, business.coverImageUrl],
  ]) {
    // A URL may be reused by both image fields; never remove a referenced file.
    if (previous?.startsWith("/uploads/") && previous !== current &&
        previous !== business.logoUrl && previous !== business.coverImageUrl &&
        !business.galleryUrls?.includes(previous)) {
      await deleteLocalFile(previous).catch(() => undefined);
    }
  }
  await invalidatePublicBusinessCache();
  return business;
};

const assertBusinessOwnership = (
  business: IBusiness | null,
  requesterId: Types.ObjectId,
): IBusiness => {
  if (!business) throw new ApiError(404, "Business not found");
  if (String(business.ownerId) !== String(requesterId)) {
    throw new ApiError(403, "You do not own this business");
  }

  return business;
};

export const updateBusinessLogo = async (
  businessId: string,
  logoUrl: string,
  requesterId: Types.ObjectId,
): Promise<IBusiness> => {
  const business = assertBusinessOwnership(
    await Business.findById(businessId),
    requesterId,
  );
  const previous = business.logoUrl;
  business.logoUrl = logoUrl.trim() || undefined;
  await business.save();
  if (previous?.startsWith("/uploads/") && previous !== business.logoUrl &&
      previous !== business.coverImageUrl && !business.galleryUrls?.includes(previous)) {
    await deleteLocalFile(previous).catch(() => undefined);
  }
  await invalidatePublicBusinessCache();
  return business;
};

export const updateBusinessCoverImage = async (
  businessId: string,
  coverImageUrl: string,
  requesterId: Types.ObjectId,
): Promise<IBusiness> => {
  const business = assertBusinessOwnership(
    await Business.findById(businessId),
    requesterId,
  );
  const previous = business.coverImageUrl;
  business.coverImageUrl = coverImageUrl.trim() || undefined;
  await business.save();
  if (previous?.startsWith("/uploads/") && previous !== business.coverImageUrl &&
      previous !== business.logoUrl && !business.galleryUrls?.includes(previous)) {
    await deleteLocalFile(previous).catch(() => undefined);
  }
  await invalidatePublicBusinessCache();
  return business;
};

export const appendBusinessGalleryImages = async (
  businessId: string,
  galleryUrls: string[],
  requesterId: Types.ObjectId,
): Promise<IBusiness> => {
  const business = assertBusinessOwnership(
    await Business.findById(businessId),
    requesterId,
  );
  const currentGallery = Array.isArray(business.galleryUrls)
    ? business.galleryUrls
    : [];
  const incoming = galleryUrls.map((url) => url.trim()).filter(Boolean);
  business.galleryUrls = [...currentGallery, ...incoming];
  await business.save();
  await invalidatePublicBusinessCache();
  return business;
};

export const removeBusinessGalleryImage = async (
  businessId: string,
  imageIndex: number,
  requesterId: Types.ObjectId,
): Promise<{ business: IBusiness; removedPath?: string }> => {
  const business = assertBusinessOwnership(
    await Business.findById(businessId),
    requesterId,
  );

  const gallery = Array.isArray(business.galleryUrls)
    ? [...business.galleryUrls]
    : [];

  if (imageIndex < 0 || imageIndex >= gallery.length) {
    throw new ApiError(400, "Invalid gallery image index");
  }

  const [removedPath] = gallery.splice(imageIndex, 1);
  business.galleryUrls = gallery;
  await business.save();
  await invalidatePublicBusinessCache();

  if (removedPath && removedPath !== business.logoUrl && removedPath !== business.coverImageUrl && !gallery.includes(removedPath)) {
    await deleteLocalFile(removedPath).catch(() => undefined);
  }

  return { business, removedPath };
};

export const createBusiness = async ({
  ownerId,
  genderTarget,
  name,
  longitude,
  latitude,
  type,
  isVisible,
  businessCategoryId,
  businessCategoryName,
  description,
  mediaLinks,
  galleryUrls,
  addressString,
  bufferRange,
  travelRate,
  minTravelFee,
  maxTravelDistance,
  homeLocation,
  cancellationWindowMinutes,
  openingTime,
  closingTime,
  weeklySchedule,
}: {
  ownerId: Types.ObjectId;
  genderTarget?: "male" | "female" | "all" | "unknown";
  name: string;
  longitude: number;
  latitude: number;
  type?: "shop" | "independent";
  isVisible?: boolean;
  businessCategoryId?: string;
  businessCategoryName?: string;
  description?: string;
  mediaLinks?: string[];
  galleryUrls?: string[];
  addressString?: string;
  bufferRange?: number;
  travelRate?: number;
  minTravelFee?: number;
  maxTravelDistance?: number;
  homeLocation?: { type: "Point"; coordinates: [number, number] };
  cancellationWindowMinutes?: number;
  openingTime?: string;
  closingTime?: string;
  weeklySchedule?: BusinessWeeklyScheduleEntry[];
}): Promise<IBusiness> => {
  const resolvedCategory = await resolveBusinessCategoryFields({
    businessCategoryId,
    businessCategoryName,
  });

  const business = await Business.create({
    name,
    type: type || "shop",
    genderTarget: genderTarget || "unknown",
    ...resolvedCategory,
    isVisible: isVisible ?? true,
    ownerId,
    location: { type: "Point", coordinates: [longitude, latitude] },
    homeLocation: homeLocation || {
      type: "Point",
      coordinates: [longitude, latitude],
    },
    description,
    mediaLinks,
    galleryUrls,
    addressString,
    bufferRange,
    travelRate,
    minTravelFee,
    maxTravelDistance,
    cancellationWindowMinutes,
    openingTime,
    closingTime,
    weeklySchedule: normalizeWeeklySchedule(
      weeklySchedule,
      openingTime || "09:00",
      closingTime || "18:00",
    ),
  });

  await invalidatePublicBusinessCache();
  return business;
};

export const getBusinessById = async (
  businessId: string,
  options: { lat?: number; lng?: number; requesterId?: string; canModerate?: boolean } = {},
): Promise<BusinessPresentation> => {
  return getBusinessDetailPresentation(businessId, options);
};
