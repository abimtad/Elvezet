import dotenv from "dotenv";
import Joi from "joi";

dotenv.config();
// main
const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .trim()
    .valid("development", "test", "production")
    .default("development"),
  PORT: Joi.number().port().default(5000),
  MONGO_URI: Joi.string().required(),
  REDIS_URL: Joi.string().required(),
  REDIS_PASSWORD: Joi.string().allow("").default(""),
  FIREBASE_PROJECT_ID: Joi.string().required(),
  FIREBASE_CLIENT_EMAIL: Joi.string().required(),
  FIREBASE_PRIVATE_KEY: Joi.string().required(),
  FIREBASE_WEB_API_KEY: Joi.string().optional(),
  CLOUDINARY_CLOUD_NAME: Joi.string().optional(),
  CLOUDINARY_API_KEY: Joi.string().optional(),
  CLOUDINARY_API_SECRET: Joi.string().optional(),
  CLOUDINARY_PROFILE_PICTURE_FOLDER: Joi.string()
    .trim()
    .default("barber-shop/profile-pictures"),
  BOOKING_LOCK_TTL_SECONDS: Joi.number()
    .integer()
    .min(120)
    .max(300)
    .default(180),
  REMINDER_LEAD_MINUTES: Joi.number().integer().min(5).max(1440).default(60),
  CANCELLATION_WINDOW_MINUTES: Joi.number()
    .integer()
    .min(0)
    .max(1440)
    .default(120),
  NO_SHOW_GRACE_MINUTES: Joi.number().integer().min(1).max(240).default(15),
  NO_SHOW_SWEEP_INTERVAL_MINUTES: Joi.number()
    .integer()
    .min(1)
    .max(120)
    .default(5),
  CACHE_TTL_SECONDS: Joi.number().integer().min(60).max(3600).default(300),
  VERIFY_ET_API_KEY: Joi.string().trim().allow("").optional(),
  VERIFY_ET_BASE_URL: Joi.string().uri().allow("").optional(),
  VERIFY_ET_WEBHOOK_SECRET: Joi.string().trim().allow("").optional(),
  APP_URL: Joi.string().uri().optional(),
})
  .unknown()
  .required();

const { error, value } = envSchema.validate(process.env, { abortEarly: false });

if (error) {
  throw new Error(`Environment validation error: ${error.message}`);
}

const env = value as {
  NODE_ENV: string;
  PORT: number;
  MONGO_URI: string;
  REDIS_URL: string;
  REDIS_PASSWORD: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  FIREBASE_WEB_API_KEY?: string;
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  CLOUDINARY_PROFILE_PICTURE_FOLDER: string;
  BOOKING_LOCK_TTL_SECONDS: number;
  REMINDER_LEAD_MINUTES: number;
  CANCELLATION_WINDOW_MINUTES: number;
  NO_SHOW_GRACE_MINUTES: number;
  NO_SHOW_SWEEP_INTERVAL_MINUTES: number;
  CACHE_TTL_SECONDS: number;
  VERIFY_ET_API_KEY?: string;
  VERIFY_ET_BASE_URL?: string;
  VERIFY_ET_WEBHOOK_SECRET?: string;
  APP_URL?: string;
};

export default env;
