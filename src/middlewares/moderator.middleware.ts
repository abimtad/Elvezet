import { NextFunction, Request, Response } from "express";
import ApiError from "../utils/ApiError";

const requireModerator = (req: Request, _res: Response, next: NextFunction) => {
  const roles = req.user?.roles || [];
  if (!roles.some((role) => role === "moderator" || role === "admin")) {
    next(new ApiError(403, "Moderator access required"));
    return;
  }

  next();
};

export default requireModerator;
