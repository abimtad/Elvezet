import { Joi } from "./common";

export const createCategorySchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
});

export const updateCategorySchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
});
