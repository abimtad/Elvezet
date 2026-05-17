import { Request, Response, NextFunction } from "express";
import ApiError from "../utils/ApiError";
import SmsSubscription from "../models/SmsSubscription";
import SuperAdminService from "../services/superAdmin.service";

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const registerTenant = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      name,
      shopName,
      ownerEmail,
      ownerPassword,
      type,
      ownerPhoneNumber,
      businessCategoryId,
      businessCategoryName,
      latitude,
      longitude,
      addressString,
      bufferRange,
      travelRate,
      minTravelFee,
      idNumber,
    } =
      req.body;

    if ((!name && !shopName) || !ownerEmail) {
      throw new ApiError(400, "name/shopName and ownerEmail are required");
    }

    const result = await SuperAdminService.registerTenant({
      name,
      shopName,
      ownerEmail,
      ownerPassword,
      type,
      ownerPhoneNumber,
      businessCategoryId,
      businessCategoryName,
      latitude: toOptionalNumber(latitude),
      longitude: toOptionalNumber(longitude),
      addressString,
      bufferRange: toOptionalNumber(bufferRange),
      travelRate: toOptionalNumber(travelRate),
      minTravelFee: toOptionalNumber(minTravelFee),
      idNumber,
    });

    if (req.body.smsRequested === true) await SmsSubscription.create({ businessId: result.business._id, requestedAt: new Date(), periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 86400000) });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const getGlobalStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const stats = await SuperAdminService.getGlobalStats();
    const roles = req.user?.roles || [];
    if (!roles.includes("admin")) {
      res.json({
        ...stats,
        totalRevenue: 0,
      });
      return;
    }

    res.json(stats);
  } catch (err) {
    next(err);
  }
};

export const getTenants = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenants = await SuperAdminService.listTenants({
      status: req.query.status as any,
      type: req.query.type as any,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      skip: req.query.skip ? Number(req.query.skip) : undefined,
    });

    res.json(tenants);
  } catch (err) {
    next(err);
  }
};

export const updateTenantCategory = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const business = await SuperAdminService.updateTenantBusinessCategory(
      String(req.params.id),
      String(req.body.businessCategoryId || ""),
    );
    res.json(business);
  } catch (err) {
    next(err);
  }
};

export const setTenantProductsEnabled = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const business = await SuperAdminService.setTenantProductsEnabled(
      String(req.params.id),
      Boolean(req.body.productsEnabled),
    );
    res.json(business);
  } catch (err) {
    next(err);
  }
};

export const getVerificationQueue = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json(await SuperAdminService.listVerificationQueue());
  } catch (err) {
    next(err);
  }
};

export const verifyTenant = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const business = await SuperAdminService.verifyIndependentBarber(
      String(req.params.id),
      {
        idCardUrl: req.body.idCardUrl,
        idNumber: req.body.idNumber,
      },
    );
    res.json(business);
  } catch (err) {
    next(err);
  }
};

export const listUsers = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json(await SuperAdminService.listUsers());
  } catch (err) {
    next(err);
  }
};

export const toggleBan = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = await SuperAdminService.toggleUserBan(
      String(req.params.id),
      Boolean(req.body.isBanned),
    );
    res.json(user);
  } catch (err) {
    next(err);
  }
};

export default {
  registerTenant,
  getGlobalStats,
  getTenants,
  updateTenantCategory,
  setTenantProductsEnabled,
  getVerificationQueue,
  verifyTenant,
  listUsers,
  toggleBan,
};
