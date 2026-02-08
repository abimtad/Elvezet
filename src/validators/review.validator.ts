import { Joi, objectId } from "./common";

export const createReviewSchema = Joi.object({
  businessId: objectId.required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().max(1000).allow("").default(""),
});

export const updateReviewSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).optional(),
  comment: Joi.string().max(1000).allow("").optional(),
}).min(1);

export const listReviewsQuerySchema = Joi.object({
  sort: Joi.string().valid("latest", "best", "worst").optional(),
});
