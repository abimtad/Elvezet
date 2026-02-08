import Joi from "joi";

const objectId = Joi.string().hex().length(24);

export const listMarketplaceQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).optional(),
  category: Joi.string().max(80).optional(),
  businessId: objectId.optional(),
});

export const productIdParamSchema = Joi.object({
  productId: objectId.required(),
});

export const createProductReviewSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().max(1000).allow("").optional(),
});

export const listProductReviewsQuerySchema = Joi.object({
  sort: Joi.string().valid("latest", "best", "worst").optional(),
});
