import Joi from "joi";

export const getMyBookingsQuerySchema = Joi.object({
  date: Joi.string().isoDate().optional(),
  month: Joi.string().pattern(/^\d{4}-\d{2}$/).optional(),
  status: Joi.string().valid("today", "completed", "pending", "all").optional(),
  from: Joi.string().isoDate().optional(),
  to: Joi.string().isoDate().optional(),
});

export const getMyStatsQuerySchema = Joi.object({
  from: Joi.string().isoDate().optional(),
  to: Joi.string().isoDate().optional(),
  period: Joi.string().valid("week", "month", "day").default("week"),
});

export const setMyAvailabilityBodySchema = Joi.alternatives().try(
  Joi.object({
    dayOfWeek: Joi.number().integer().min(0).max(6).required(),
    startTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(),
    endTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(),
  }),
  Joi.array().items(
    Joi.object({
      dayOfWeek: Joi.number().integer().min(0).max(6).required(),
      startTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(),
      endTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).required(),
    }),
  ),
);

export const createMyAbsenceBodySchema = Joi.object({
  startTime: Joi.date().iso().required(),
  endTime: Joi.date().iso().greater(Joi.ref("startTime")).required(),
  reason: Joi.string().max(300).optional().allow(""),
});

export const toggleMyVisibilityBodySchema = Joi.object({
  isOnlineVisible: Joi.boolean().required(),
});
