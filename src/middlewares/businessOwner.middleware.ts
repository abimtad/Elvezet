import { NextFunction, Request, Response } from "express";
import Business from "../models/Business";
import ApiError from "../utils/ApiError";

/**
 * Verifies the authenticated user owns the business identified by :shopId.
 * Attaches the business document to req for downstream handlers.
 */
const requireBusinessOwner = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const shopId = String(
      req.params.shopId ?? req.params.businessId ?? req.params.id ?? "",
    );
    if (!shopId) {
      next(new ApiError(400, "Missing shopId/businessId parameter"));
      return;
    }

    const business = await Business.findById(shopId);
    if (!business) {
      next(new ApiError(404, "Business not found"));
      return;
    }

    if (req.user?.roles.includes("admin")) {
      req.business = business;
      next();
      return;
    }

    if (String(business.ownerId) !== String(req.user?._id)) {
      next(new ApiError(403, "You do not own this business"));
      return;
    }

    req.business = business;
    next();
  } catch {
    next(new ApiError(500, "Failed to verify business ownership"));
  }
};

export default requireBusinessOwner;
