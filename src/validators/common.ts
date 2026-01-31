import Joi from "joi";

export const objectId = Joi.string().hex().length(24);
export { Joi };
