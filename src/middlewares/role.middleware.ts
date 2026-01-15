import { NextFunction, Request, Response } from "express";
import ApiError from "../utils/ApiError";

const requireRole = (
  ...allowedRoles: Array<"customer" | "staff" | "owner" | "admin" | "moderator">
) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const userRoles = req.user?.roles || [];
    const hasRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      next(new ApiError(403, "You are not allowed to perform this action"));
      return;
    }

    next();
  };
};

export default requireRole;

export const requireModerator = requireRole("admin", "moderator");
