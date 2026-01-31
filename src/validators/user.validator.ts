import { Joi } from "./common";

export const registerTokenSchema = Joi.object({
  fcmToken: Joi.string().min(10).max(4096).required(),
  app: Joi.string().valid("customer", "business", "independent").default("customer"),
});
