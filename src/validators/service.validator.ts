import { Joi } from "./common";

export const createServiceSchema = Joi.object({
  // businessId: objectId.required(),
  name: Joi.string().min(2).max(100).required(),
  category: Joi.string().min(2).max(50).optional(),
  categoryName: Joi.string().min(2).max(50).optional(),
  sortOrder: Joi.number().integer().min(0).optional(),
  duration: Joi.number().integer().min(5).max(600).required(),
  basePrice: Joi.number().min(0).required(),
});

export const updateServiceSchema = Joi.object({
  isActive: Joi.boolean().optional(),
  name: Joi.string().min(2).max(100).optional(),
  category: Joi.string().min(2).max(50).optional(),
  categoryName: Joi.string().min(2).max(50).optional(),
  sortOrder: Joi.number().integer().min(0).optional(),
  duration: Joi.number().integer().min(5).max(600).optional(),
  basePrice: Joi.number().min(0).optional(),
}).min(1);
