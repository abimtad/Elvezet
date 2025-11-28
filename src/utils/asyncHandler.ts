import { NextFunction, Request, Response } from "express";

type AsyncFn = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

const asyncHandler =
  (fn: AsyncFn) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export default asyncHandler;
