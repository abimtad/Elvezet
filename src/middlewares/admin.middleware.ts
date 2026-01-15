import { NextFunction, Request, Response } from "express";
import ApiError from "../utils/ApiError";

const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  const roles = req.user?.roles || [];
  if (!roles.includes("admin")) {
    next(new ApiError(403, "Administrator access required"));
    return;
  }
  next();
};

export default requireAdmin;
