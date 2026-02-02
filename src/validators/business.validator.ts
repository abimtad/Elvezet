import { Joi, objectId } from "./common";
import { MAX_ALLOWED_TRAVEL_RATE } from "../config/constants";
import { INSTAGRAM_URL_REGEX, TIKTOK_URL_REGEX } from "../utils/socialUrl.utils";

const locationSchema = Joi.object({
  type: Joi.string().valid("Point").default("Point"),
  coordinates: Joi.array().items(Joi.number().required()).length(2).required(),
});

const timeSchema = Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/);

const weeklyScheduleEntrySchema = Joi.object({
  dayOfWeek: Joi.number().integer().min(0).max(6).required(),
  isOpen: Joi.boolean().required(),
  openingTime: timeSchema.when("isOpen", {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional().allow("", null),
  }),
  closingTime: timeSchema.when("isOpen", {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional().allow("", null),
  }),
});

const mediaLinkSchema = Joi.string().pattern(
  /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|tiktok\.com)(\/|$)/i,
);

const instagramUrlSchema = Joi.string().pattern(INSTAGRAM_URL_REGEX).messages({
  "string.pattern.base": "Must be a valid instagram.com profile URL",
});

const tiktokUrlSchema = Joi.string().pattern(TIKTOK_URL_REGEX).messages({
  "string.pattern.base": "Must be a valid tiktok.com video URL",
});

const imageUrlSchema = Joi.string().uri().allow("", null);

export const createBusinessSchema = Joi.object({
  smsRequested: Joi.boolean().optional(),
  genderTarget: Joi.string().valid("male", "female", "all", "unknown").default("unknown"),
  name: Joi.string().min(2).max(120).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  latitude: Joi.number().min(-90).max(90).required(),
  type: Joi.string().valid("shop", "independent").required(),
  businessCategoryId: objectId.optional(),
  businessCategoryName: Joi.string().trim().min(2).max(100).optional(),
  isVisible: Joi.boolean().optional(),
  description: Joi.string().max(2000).allow("", null).optional(),
  mediaLinks: Joi.array().items(mediaLinkSchema).optional(),
  galleryUrls: Joi.array().items(Joi.string().uri()).optional(),
  logoUrl: imageUrlSchema.optional(),
  coverImageUrl: imageUrlSchema.optional(),
  instagramUrl: instagramUrlSchema.allow("", null).optional(),
  tiktokUrls: Joi.array().items(tiktokUrlSchema).max(5).optional(),
  addressString: Joi.string().max(500).required(),
  bufferRange: Joi.number().min(0).optional(),
  travelRate: Joi.number().min(0).max(MAX_ALLOWED_TRAVEL_RATE).optional(),
  minTravelFee: Joi.number().min(0).optional(),
  maxTravelDistance: Joi.number().min(0).optional(),
  homeLocation: locationSchema.optional(),
  cancellationWindowMinutes: Joi.number().integer().min(0).max(1440).optional(),
  openingTime: timeSchema.optional(),
  closingTime: timeSchema.optional(),
  weeklySchedule: Joi.array().items(weeklyScheduleEntrySchema).max(7).optional(),
});

export const updateBusinessSchema = Joi.object({
  settlementAccount: Joi.string().trim().max(80).allow("", null).optional(),
  settlementBank: Joi.string().trim().lowercase().replace(/^cbe_birr$/, "cbebirr").valid("cbe", "boa", "telebirr", "mpesa", "cbebirr", "dashen", "awash", "siinqee", "kaafiebirr", "coopayebirr").allow("", null).optional(),
  paymentInstructions: Joi.string().trim().max(1000).allow("", null).optional(),
  requirePrepayment: Joi.boolean().optional(),
  muslimFriendlyEnabled: Joi.boolean().optional(),
  muslimAmenities: Joi.array()
    .items(
      Joi.string().valid(
        "women_only_hours",
        "same_gender_staff",
        "hijab_friendly",
        "private_rooms",
        "wudu_available",
        "family_area",
        "prayer_space",
      ),
    )
    .max(12)
    .optional(),
  minimumNoticeMinutes: Joi.number().integer().min(0).max(10080).optional(),
  cancellationWindowMinutes: Joi.number().integer().min(0).max(1440).optional(),
  slotInterval: Joi.number().integer().min(5).max(60).optional(),
  bookingBufferMinutes: Joi.number().integer().min(0).max(120).optional(),
  name: Joi.string().min(2).max(120).optional(),
  description: Joi.string().max(2000).allow("", null).optional(),
  mediaLinks: Joi.array().items(mediaLinkSchema).optional(),
  galleryUrls: Joi.array().items(Joi.string().uri()).optional(),
  logoUrl: imageUrlSchema.optional(),
  coverImageUrl: imageUrlSchema.optional(),
  instagramUrl: instagramUrlSchema.allow("", null).optional(),
  tiktokUrls: Joi.array().items(tiktokUrlSchema).max(5).optional(),
  type: Joi.string().valid("shop", "independent").optional(),
  businessCategoryId: objectId.optional(),
  businessCategoryName: Joi.string().trim().min(2).max(100).optional(),
  isVisible: Joi.boolean().optional(),
  addressString: Joi.string().max(500).optional(),
  genderTarget: Joi.string().valid("male", "female", "all", "unknown").optional(),
  averagePrice: Joi.number().min(0).optional(),
  bufferRange: Joi.number().min(0).optional(),
  travelRate: Joi.number().min(0).max(MAX_ALLOWED_TRAVEL_RATE).optional(),
  minTravelFee: Joi.number().min(0).optional(),
  maxTravelDistance: Joi.number().min(0).optional(),
  homeLocation: locationSchema.optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  latitude: Joi.number().min(-90).max(90).optional(),
  openingTime: timeSchema.optional(),
  closingTime: timeSchema.optional(),
  weeklySchedule: Joi.array().items(weeklyScheduleEntrySchema).max(7).optional(),
}).min(1);

export const listBusinessesQuerySchema = Joi.object({
  lat: Joi.number().min(-90).max(90).optional(),
  lng: Joi.number().min(-180).max(180).optional(),
  radiusKm: Joi.number().min(0).max(500).optional(),
  gender: Joi.string().valid("male", "female", "all").optional(),
  type: Joi.string().valid("shop", "independent").optional(),
  minPrice: Joi.number().min(0).optional(),
  maxPrice: Joi.number().min(0).optional(),
  minRating: Joi.number().min(0).max(5).optional(),
  q: Joi.string().trim().min(1).max(120).optional(),
  category: Joi.string().trim().min(1).max(80).optional(),
  muslimFriendly: Joi.boolean().optional(),
});

export const quoteBusinessSchema = Joi.object({
  userLat: Joi.number().min(-90).max(90).required(),
  userLng: Joi.number().min(-180).max(180).required(),
  serviceIds: Joi.array().items(Joi.string().hex().length(24).required()).min(1).required(),
});
