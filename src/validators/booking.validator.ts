import { Joi, objectId } from "./common";

export const createBookingSchema = Joi.object({
  businessId: objectId.required(),
  serviceIds: Joi.array().items(objectId.required()).min(1).required(),
  userLat: Joi.number().min(-90).max(90).optional(),
  userLng: Joi.number().min(-180).max(180).optional(),
  paymentScreenshotUrl: Joi.string().uri().optional(),
  staffPlan: Joi.array()
    .items(
      Joi.object({
        staffId: Joi.string().required(),
        serviceId: objectId.required(),
        startTime: Joi.date().iso().required(),
        endTime: Joi.date().iso().required(),
      }),
    )
    .min(1)
    .required(),
  startTime: Joi.date().iso().required(),
  endTime: Joi.date().iso().greater(Joi.ref("startTime")).required(),
  paymentMethod: Joi.string()
    .valid("cash", "in-shop", "chapa", "cbe", "cbe_birr", "telebirr", "online_other")
    .default("in-shop"),
});

export const cancelBookingSchema = Joi.object({
  reason: Joi.string().max(300).allow("").optional(),
});

export const payBookingSchema = Joi.object({});

export const checkoutBookingSchema = Joi.object({
  products: Joi.array()
    .items(
      Joi.object({
        productId: objectId.required(),
        quantity: Joi.number().integer().min(1).required(),
      }),
    )
    .default([]),
  priceOverride: Joi.number().min(0).optional(),
  paymentMethod: Joi.string()
    .valid("cash", "in-shop", "cbe", "cbe_birr", "telebirr", "online_other")
    .default("cash"),
  tip: Joi.number().min(0).optional(),
});

export const rescheduleBookingSchema = Joi.object({
  startTime: Joi.date().iso().required(),
  endTime: Joi.date().iso().greater(Joi.ref("startTime")).required(),
  staffId: Joi.string().optional(),
});

export const checkAvailabilitySchema = Joi.object({
  shopId: objectId.required(),
  date: Joi.string().required(),
  serviceIds: Joi.array().items(objectId.required()).min(1).required(),
  professionalId: Joi.string().allow(null).optional(),
  skipNextAvailable: Joi.boolean().optional(),
});

export const checkAvailabilityRangeSchema = Joi.object({
  shopId: objectId.required(),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  days: Joi.number().integer().min(1).max(7).required(),
  serviceIds: Joi.array().items(objectId.required()).min(1).required(),
  professionalId: Joi.string().allow(null).optional(),
});
