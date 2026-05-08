import ApiError from "../utils/ApiError";
import SmsSubscription from "../models/SmsSubscription";
import { Request, Response } from "express";
import asyncHandler from "../utils/asyncHandler";
import {
  calculateBusinessQuote,
  createBusiness,
  appendBusinessGalleryImages,
  getBusinessById,
  listBusinesses,
  updateBusinessCoverImage,
  updateBusinessLogo,
  removeBusinessGalleryImage,
  updateBusiness,
} from "../services/business.service";
import { toPublicUrl, uploadAndCompressImage } from "../services/media.service";
import { sendSuccess } from "../utils/httpResponse";

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
};

export const listBusinessesController = asyncHandler(
  async (req: Request, res: Response) => {
    const businesses = await listBusinesses({
      lat: toOptionalNumber(req.query.lat),
      lng: toOptionalNumber(req.query.lng),
      radiusKm: toOptionalNumber(req.query.radiusKm),
      gender:
        typeof req.query.gender === "string"
          ? (req.query.gender as "male" | "female" | "all")
          : undefined,
      type:
        typeof req.query.type === "string"
          ? (req.query.type as "shop" | "independent")
          : undefined,
      minPrice: toOptionalNumber(req.query.minPrice),
      maxPrice: toOptionalNumber(req.query.maxPrice),
      minRating: toOptionalNumber(req.query.minRating),
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      category:
        typeof req.query.category === "string" ? req.query.category : undefined,
      muslimFriendly:
        String(req.query.muslimFriendly || "").toLowerCase() === "true" ||
        req.query.muslimFriendly === "1"
          ? true
          : undefined,
    });
    sendSuccess(res, 200, businesses);
  },
);

export const createBusinessController = asyncHandler(
  async (req: Request, res: Response) => {
    const business = await createBusiness({
      ownerId: req.user!._id,
      ...req.body,
    });
    if (req.body.smsRequested === true) await SmsSubscription.create({ businessId: business._id, requestedAt: new Date(), periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 86400000) });
    sendSuccess(res, 201, await getBusinessById(String(business._id), { requesterId: String(req.user!._id) }));
  },
);

export const getBusinessController = asyncHandler(
  async (req: Request, res: Response) => {
    const { businessId } = req.params;
    const business = await getBusinessById(String(businessId), {
      requesterId: req.user ? String(req.user._id) : undefined,
      canModerate: req.user?.roles.some(role => role === "admin" || role === "moderator"),
      lat: toOptionalNumber(req.query.lat),
      lng: toOptionalNumber(req.query.lng),
    });
    sendSuccess(res, 200, business);
  },
);

export const updateBusinessController = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id || req.params.businessId || "");
    await updateBusiness(id, req.body, req.user!._id);
    sendSuccess(res, 200, await getBusinessById(id, { requesterId: String(req.user!._id) }));
  },
);

export const uploadBusinessLogoController = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id || req.params.businessId || "");
    const file = req.file;
    if (!file) {
      throw new ApiError(400, "No logo image file provided");
    }

    const logoUrl = await uploadAndCompressImage(file.buffer, "logos");
    await updateBusinessLogo(id, logoUrl, req.user!._id);
    sendSuccess(res, 200, await getBusinessById(id, { requesterId: String(req.user!._id) }));
  },
);

export const uploadBusinessCoverController = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id || req.params.businessId || "");
    const file = req.file;
    if (!file) {
      throw new ApiError(400, "No cover image file provided");
    }

    const coverImageUrl = await uploadAndCompressImage(file.buffer, "covers");
    await updateBusinessCoverImage(
      id,
      coverImageUrl,
      req.user!._id,
    );
    sendSuccess(res, 200, await getBusinessById(id, { requesterId: String(req.user!._id) }));
  },
);

export const uploadBusinessGalleryController = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id || req.params.businessId || "");
    const files = Array.isArray(req.files)
      ? (req.files as Express.Multer.File[])
      : [];

    if (!files.length) {
      throw new ApiError(400, "No gallery image files provided");
    }

    const galleryUrls = await Promise.all(
      files.map((file) => uploadAndCompressImage(file.buffer, "gallery")),
    );
    await appendBusinessGalleryImages(
      id,
      galleryUrls,
      req.user!._id,
    );
    sendSuccess(res, 200, await getBusinessById(id, { requesterId: String(req.user!._id) }));
  },
);

export const deleteBusinessGalleryImageController = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id || req.params.businessId || "");
    const imageIndex = Number(req.params.imageIndex);
    await removeBusinessGalleryImage(id, imageIndex, req.user!._id);
    sendSuccess(res, 200, await getBusinessById(id, { requesterId: String(req.user!._id) }));
  },
);

export const uploadBusinessIdCardController = asyncHandler(
  async (req: Request, res: Response) => {
    const id = String(req.params.id || req.params.businessId || "");
    const file = req.file;
    const idNumber =
      typeof req.body.idNumber === "string" ? req.body.idNumber.trim() : "";

    if (!file) {
      throw new ApiError(400, "No ID card image file provided");
    }

    const idCardUrl = await uploadAndCompressImage(file.buffer, "id-cards");
    const { default: Business } = await import("../models/Business");
    const business = await Business.findByIdAndUpdate(
      id,
      {
        $set: {
          idCardUrl,
          ...(idNumber ? { idNumber } : {}),
        },
      },
      { new: true },
    );

    if (!business) {
      throw new ApiError(404, "Business not found");
    }

    sendSuccess(res, 200, {
      ...business.toObject(),
      idCardUrl: toPublicUrl(idCardUrl),
    });
  },
);

export const quoteBusinessController = asyncHandler(
  async (req: Request, res: Response) => {
    const businessId = String(req.params.id || req.params.businessId || "");
    const quote = await calculateBusinessQuote(businessId, {
      userLat: Number(req.body.userLat),
      userLng: Number(req.body.userLng),
      serviceIds: Array.isArray(req.body.serviceIds)
        ? req.body.serviceIds.map(String)
        : [],
    });

    sendSuccess(res, 200, quote);
  },
);
