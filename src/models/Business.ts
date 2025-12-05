import { Document, model, Schema, Types } from "mongoose";

export interface IBusiness extends Document {
  name: string;
  smsContactPhone?: string;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  homeLocation?: {
    type: "Point";
    coordinates: [number, number];
  };
  ownerId: Types.ObjectId;
  type: "shop" | "independent";
  businessCategoryId?: Types.ObjectId;
  businessCategoryName?: string;
  isVisible?: boolean;
  /** Super-admin gate: shop may list/sell products. Default off. */
  productsEnabled: boolean;
  /** Owner opt-in: list under the Muslim-friendly Home category. */
  muslimFriendlyEnabled: boolean;
  /** Amenity tags shown on the customer popup (fixed vocabulary). */
  muslimAmenities: string[];
  rating: number;
  description?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  instagramUrl?: string;
  tiktokUrls?: string[];
  mediaLinks?: string[];
  galleryUrls?: string[];
  verificationStatus?: "pending" | "active" | "suspended";
  idCardUrl?: string;
  idNumber?: string;
  addressString?: string;
  genderTarget?: "male" | "female" | "all" | "unknown";
  averagePrice?: number;
  bufferRange?: number;
  travelRate?: number;
  minTravelFee?: number;
  maxTravelDistance?: number;
  cancellationWindowMinutes: number;
  openingTime: string;
  closingTime: string;
  weeklySchedule?: Array<{
    dayOfWeek: number;
    isOpen: boolean;
    openingTime?: string;
    closingTime?: string;
  }>;
  slotInterval: number;
  bookingBufferMinutes?: number;
  minimumNoticeMinutes?: number;
  /** When true (or type=independent), bookings stay pending until Verify.ET confirms payment. */
  requirePrepayment?: boolean;
  /** Expected Telebirr/CBE/etc account for Verify.ET settlement matching. */
  settlementAccount?: string;
  settlementBank?: string;
  paymentInstructions?: string;
}

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const businessSchema = new Schema<IBusiness>(
  {
    name: { type: String, required: true, trim: true },
    smsContactPhone: { type: String, trim: true },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (arr: number[]) => Array.isArray(arr) && arr.length === 2,
          message: "Location coordinates must include [longitude, latitude]",
        },
      },
    },
    homeLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: undefined,
        validate: {
          validator: (arr: number[]) => !arr || (Array.isArray(arr) && arr.length === 2),
          message: "Home location coordinates must include [longitude, latitude]",
        },
      },
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["shop", "independent"],
      required: true,
      default: "shop",
    },
    businessCategoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      index: true,
    },
    businessCategoryName: { type: String, trim: true },
    isVisible: { type: Boolean, default: true },
    productsEnabled: { type: Boolean, default: false, index: true },
    muslimFriendlyEnabled: { type: Boolean, default: false, index: true },
    muslimAmenities: {
      type: [
        {
          type: String,
          enum: [
            "women_only_hours",
            "same_gender_staff",
            "hijab_friendly",
            "private_rooms",
            "wudu_available",
            "family_area",
            "prayer_space",
          ],
        },
      ],
      default: [],
    },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    description: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    coverImageUrl: { type: String, trim: true },
    instagramUrl: { type: String, trim: true },
    tiktokUrls: [{ type: String, trim: true }],
    mediaLinks: [{ type: String, trim: true }],
    galleryUrls: [{ type: String, trim: true }],
    verificationStatus: {
      type: String,
      enum: ["pending", "active", "suspended"],
      default: "pending",
    },
    idCardUrl: { type: String, trim: true },
    idNumber: { type: String, trim: true },
    addressString: { type: String, trim: true },
    genderTarget: {
      type: String,
      enum: ["male", "female", "all", "unknown"],
      default: "unknown",
    },
    averagePrice: { type: Number, default: 0, min: 0 },
    bufferRange: { type: Number, default: 0, min: 0 },
    travelRate: { type: Number, default: 0, min: 0, max: 1000 },
    minTravelFee: { type: Number, default: 0, min: 0 },
    maxTravelDistance: { type: Number, default: 0, min: 0 },
    cancellationWindowMinutes: { type: Number, default: 120 },
    openingTime: {
      type: String,
      default: "09:00",
      match: timeRegex,
    },
    closingTime: {
      type: String,
      default: "18:00",
      match: timeRegex,
    },
    weeklySchedule: [
      {
        dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
        isOpen: { type: Boolean, default: true },
        openingTime: { type: String, match: timeRegex },
        closingTime: { type: String, match: timeRegex },
      },
    ],
    slotInterval: { type: Number, default: 15, min: 5, max: 60 },
    bookingBufferMinutes: { type: Number, default: 10, min: 0, max: 120 },
    minimumNoticeMinutes: { type: Number, default: 0, min: 0, max: 10080 },
    requirePrepayment: { type: Boolean, default: false },
    settlementAccount: { type: String, trim: true },
    settlementBank: { type: String, trim: true },
    paymentInstructions: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

businessSchema.index({ location: "2dsphere" });

export default model<IBusiness>("Business", businessSchema);
