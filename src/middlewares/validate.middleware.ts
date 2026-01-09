import { NextFunction, Request, Response } from "express";
import Joi from "joi";
import ApiError from "../utils/ApiError";

const validate = (
  schema: Joi.Schema,
  property: "body" | "params" | "query" = "body",
) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      next(
        new ApiError(
          400,
          "Validation failed",
          error.details.map((d) => d.message),
        ),
      );
      return;
    }

    if (property === "query") {
      Object.assign(req.query, value);
    } else if (property === "params") {
      Object.assign(req.params, value);
    } else {
      req.body = value;
    }
    next();
  };
};

export default validate;
