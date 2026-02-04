import { Joi, objectId } from "./common";

export const createStaffSchema = Joi.object({
  userId: objectId.required(),
  businessId: objectId.required(),
  services: Joi.array().items(objectId).default([]),
  overrides: Joi.array()
    .items(
      Joi.object({
        serviceId: objectId.required(),
        price: Joi.number().min(0).required(),
      }),
    )
    .default([]),
});
