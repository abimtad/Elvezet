import { Joi, objectId } from "./common";

export const shopIdParamSchema = Joi.object({
  shopId: objectId.required(),
});

export const bookingIdParamSchema = Joi.object({
  shopId: objectId.required(),
  id: objectId.required(),
});

export const staffIdParamSchema = Joi.object({
  shopId: objectId.required(),
  id: objectId.required(),
});

export const absenceIdParamSchema = Joi.object({
  shopId: objectId.required(),
  id: objectId.required(),
  absenceId: objectId.required(),
});

export const serviceIdParamSchema = Joi.object({
  shopId: objectId.required(),
  id: objectId.required(),
});

// ── Query schemas ──

export const listBookingsQuerySchema = Joi.object({
  date: Joi.date().iso().optional(),
  status: Joi.string()
    .valid("confirmed", "pending", "expired", "upcoming", "in-progress", "completed", "cancelled", "no-show", "no_show")
    .optional(),
  staffId: objectId.optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

export const revenueQuerySchema = Joi.object({
  range: Joi.string().valid("day", "week", "month").default("day"),
  date: Joi.date().iso().optional(),
});

export const listAbsencesQuerySchema = Joi.object({
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
});

// ── Body schemas ──

export const cancelBookingSchema = Joi.object({
  reason: Joi.string().max(300).allow("").optional(),
});

export const createStaffBodySchema = Joi.object({
  staffId: Joi.string().optional(),
  fullName: Joi.string().min(2).max(120).optional(),
  email: Joi.string().email().optional(),
  phoneNumber: Joi.string().trim().min(7).max(20).optional(),
  specialties: Joi.array().items(Joi.string().trim()).default([]),
  services: Joi.array().items(objectId).default([]),
  overrides: Joi.array()
    .items(
      Joi.object({
        serviceId: objectId.required(),
        price: Joi.number().min(0).required(),
      }),
    )
    .default([]),
}).or("staffId", "fullName");

export const updateStaffBodySchema = Joi.object({
  role: Joi.string().trim().max(80).optional(),
  permissionLevel: Joi.string().valid("low", "medium", "high").optional(),
  hourlyWage: Joi.number().min(0).max(1000000).optional(),
  serviceCommission: Joi.object({ type: Joi.string().valid("fixed", "tiered").required(), value: Joi.number().min(0).max(100).required() }).optional(),
  productCommission: Joi.number().min(0).max(100).optional(),
  biography: Joi.string().max(2000).allow("").optional(),
  isBookableInCalendar: Joi.boolean().optional(),
  specialties: Joi.array().items(Joi.string().trim()).optional(),
  services: Joi.array().items(objectId).optional(),
  isActive: Joi.boolean().optional(),
  isOnlineVisible: Joi.boolean().optional(),
});

export const setStaffVisibilityBodySchema = Joi.object({
  isOnlineVisible: Joi.boolean().required(),
});

const availabilityInputSchema = Joi.object({
  dayOfWeek: Joi.number().integer().min(0).max(6).required(),
  startTime: Joi.string()
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .required(),
  endTime: Joi.string()
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .required(),
});

export const setAvailabilityBodySchema = Joi.alternatives().try(
  availabilityInputSchema,
  Joi.array().items(availabilityInputSchema).min(1),
);

export const createAbsenceBodySchema = Joi.object({
  startTime: Joi.date().iso().required(),
  endTime: Joi.date().iso().greater(Joi.ref("startTime")).required(),
  reason: Joi.string().max(300).allow("").optional(),
});

export const updateServiceBodySchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  categoryName: Joi.string().min(2).max(100).optional(),
  duration: Joi.number().integer().min(5).max(600).optional(),
  basePrice: Joi.number().min(0).optional(),
});

export const createServiceBodySchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  categoryName: Joi.string().min(2).max(100).optional(),
  duration: Joi.number().integer().min(5).max(600).required(),
  basePrice: Joi.number().min(0).required(),
});

export const createProductBodySchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  brand: Joi.string().max(100).allow("").optional(),
  category: Joi.string().max(80).allow("").optional(),
  description: Joi.string().max(2000).allow("").optional(),
  imageUrl: Joi.string().max(500).allow("").optional(),
  price: Joi.number().min(0).required(),
  stockQuantity: Joi.number().integer().min(0).optional(),
  minStockAlert: Joi.number().integer().min(0).optional(),
  isActive: Joi.boolean().optional(),
});

export const updateProductBodySchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  brand: Joi.string().max(100).allow("").optional(),
  category: Joi.string().max(80).allow("").optional(),
  description: Joi.string().max(2000).allow("").optional(),
  imageUrl: Joi.string().max(500).allow("").optional(),
  price: Joi.number().min(0).optional(),
  stockQuantity: Joi.number().integer().min(0).optional(),
  minStockAlert: Joi.number().integer().min(0).optional(),
  isActive: Joi.boolean().optional(),
});

export const productIdParamSchema = Joi.object({
  shopId: objectId.required(),
  id: objectId.required(),
});

export const walkInBodySchema = Joi.object({
  serviceIds: Joi.array().items(objectId.required()).min(1).required(),
  staffPlan: Joi.array()
    .items(
      Joi.object({
        staffId: Joi.string().required(),
        serviceId: objectId.required(),
        startTime: Joi.date().iso().required(),
        endTime: Joi.date().iso().greater(Joi.ref("startTime")).required(),
      }),
    )
    .min(1)
    .required(),
  startTime: Joi.date().iso().required(),
  endTime: Joi.date().iso().greater(Joi.ref("startTime")).required(),
  phoneNumber: Joi.string().trim().min(7).max(20).required(),
  fullName: Joi.string().trim().min(2).max(120).optional(),
  email: Joi.string().email().optional(),
  notes: Joi.string().max(500).allow("").optional(),
  paymentMethod: Joi.string()
    .valid("cash", "in-shop", "cbe", "cbe_birr", "telebirr", "online_other")
    .default("cash"),
  userLat: Joi.number().optional(),
  userLng: Joi.number().optional(),
});

export const clientSearchQuerySchema = Joi.object({
  query: Joi.string().allow("").optional(),
});

export const updateClientNotesBodySchema = Joi.object({
  notes: Joi.string().max(2000).allow("").required(),
});

export const updateBookingAppointmentBodySchema = Joi.object({
  appointmentNotes: Joi.string().max(2000).allow("").optional(),
  serviceIds: Joi.array().items(objectId.required()).min(1).optional(),
  tipAmount: Joi.number().min(0).optional(),
});
