import { Joi } from "./common";

export const signUpSchema = Joi.object({
  firebaseUid: Joi.string().trim().min(6).max(128).required(),
  fullName: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().email().required(),
  phoneNumber: Joi.string().trim().min(7).max(20).optional(),
  profilePicture: Joi.forbidden().messages({
    "any.unknown":
      "profilePicture must be uploaded as an image file, not sent in the request body.",
  }),
});

export const signInSchema = Joi.object({
  idToken: Joi.string().trim().required(),
});

export const customerCheckoutSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(60).when("loginOnly", {
    is: true,
    then: Joi.optional().allow(""),
    otherwise: Joi.required(),
  }),
  lastName: Joi.string().trim().min(1).max(60).allow("").optional(),
  phoneNumber: Joi.string().trim().min(7).max(20).required(),
  email: Joi.string().email().allow("").optional(),
  loginOnly: Joi.boolean().optional(),
});

export const updateProfileSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(120).optional(),
  email: Joi.string().email().optional(),
  phoneNumber: Joi.string().trim().min(7).max(20).optional(),
  profilePicture: Joi.forbidden().messages({
    "any.unknown":
      "profilePicture must be uploaded as a file field (profileImage/profilePicture).",
  }),
});

export const changePasswordSchema = Joi.object({
  newPassword: Joi.string().trim().min(8).max(128).required(),
});
