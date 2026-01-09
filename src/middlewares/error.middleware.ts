import { NextFunction, Request, Response } from "express";
import ApiError from "../utils/ApiError";

export const notFoundHandler = (
  _req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  next(new ApiError(404, "Route not found"));
};

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const typedError = err as Partial<ApiError> & { stack?: string };
  const statusCode = typedError.statusCode || 500;
  const retryAfter = (err as { retryAfter?: number })?.retryAfter;
  if (statusCode === 429 && retryAfter) res.setHeader('Retry-After', retryAfter);

  res.status(statusCode).json({
    status: "error",
    data: typedError.details ?? null,
    message: typedError.message || "Internal server error",
  });
};
