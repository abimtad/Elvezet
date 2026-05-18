import { Router } from "express";
import multer from "multer";
import Joi from "joi";
import mongoose from "mongoose";
import sharp from "sharp";
import auth from "../middlewares/auth.middleware";
import requireAdmin from "../middlewares/admin.middleware";
import requireRole from "../middlewares/role.middleware";
import asyncHandler from "../utils/asyncHandler";
import ApiError from "../utils/ApiError";
import BusinessPoster from "../models/BusinessPoster";
import { deleteLocalFile, toPublicUrl, uploadAndCompressImage } from "../services/media.service";
import { businessPosterPolicy, posterDimensionsError } from "../utils/business-poster-policy";

export const posterSchema = Joi.object({
  title: Joi.string().trim().max(120).required(),
  placement: Joi.string().valid("home", "clients", "both").required(),
  audience: Joi.string().valid("staff", "independent", "both").default("both"),
  isActive: Joi.boolean().required(),
  sortOrder: Joi.number().integer().min(0).max(9999).required(),
  startAt: Joi.date().iso().allow(null, "").default(null),
  endAt: Joi.date().iso().allow(null, "").default(null),
  linkUrl: Joi.string().trim().max(2048).uri({ scheme: ["https"] }).allow("").default(""),
});
export function validatePoster(body: unknown) {
  const result = posterSchema.validate(body);
  if (result.error) throw new ApiError(400, result.error.details[0]!.message);
  const value = result.value;
  value.startAt = value.startAt || null; value.endAt = value.endAt || null;
  value.audience = value.audience || "both";
  if (value.startAt && value.endAt && value.endAt <= value.startAt) throw new ApiError(400, "End time must be after start time");
  if (value.linkUrl) {
    const url = new URL(value.linkUrl);
    if (url.username || url.password) throw new ApiError(400, "Link must not contain credentials");
  }
  return value;
}
export const activePosterFilter = (placement: string, audience: string, now: Date) => ({
  isActive: true,
  placement: { $in: [placement, "both"] },
  // Missing audience (legacy posters) counts as both apps.
  $or: [
    { audience: { $in: [audience, "both"] } },
    { audience: { $exists: false } },
    { audience: null },
  ],
  $and: [
    { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
    { $or: [{ endAt: null }, { endAt: { $gt: now } }] },
  ],
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: businessPosterPolicy.maxFileBytes, files: 1, fields: 8 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) cb(null, true);
    else cb(new ApiError(400, "Use a JPEG, PNG or WebP image (up to 5 MB)"));
  },
}).single("image");
const serialize = (poster: any) => ({ ...poster, imageUrl: toPublicUrl(poster.imagePath), imagePath: undefined });
const router = Router();
router.get("/business-posters", auth, requireRole("staff", "owner", "admin"), asyncHandler(async (req, res) => {
  const placement = req.query.placement;
  if (placement !== "home" && placement !== "clients") throw new ApiError(400, "Choose home or clients placement");
  const audienceRaw = String(req.query.audience || "").trim();
  // Older staff builds omit audience; they only showed the staff surfaces.
  const audience = audienceRaw === "independent" ? "independent" : "staff";
  const now = new Date();
  const posters = await BusinessPoster.find(activePosterFilter(placement, audience, now)).sort({ sortOrder: 1, _id: 1 }).limit(20).lean();
  res.setHeader("Cache-Control", "private, no-cache");
  res.json({ data: { posters: posters.map(serialize), serverTime: now.toISOString() } });
}));
router.use("/admin/business-posters", auth, requireAdmin);
router.get("/admin/business-posters", asyncHandler(async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ data: await BusinessPoster.find().sort({ sortOrder: 1, _id: 1 }).lean().then(items => items.map(serialize)) });
}));
for (const method of ["post", "patch"] as const) {
  router[method](method === "post" ? "/admin/business-posters" : "/admin/business-posters/:id", (req, res, next) => upload(req, res, error => next(error instanceof multer.MulterError ? new ApiError(400, "Use one image under 5 MB and valid poster fields") : error)), asyncHandler(async (req, res) => {
    const value = validatePoster(req.body);
    const creating = method === "post";
    if (!creating && !mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid poster id");
    const existing = creating ? null : await BusinessPoster.findById(req.params.id);
    if (!creating && !existing) throw new ApiError(404, "Poster not found");
    if (creating && !req.file) throw new ApiError(400, "Choose a poster image");
    if (creating && await BusinessPoster.countDocuments() >= 100) throw new ApiError(400, "Remove an old poster before adding another (100 maximum)");
    let imagePath: string | undefined;
    if (req.file) {
      let info: sharp.Metadata;
      try {
        info = await sharp(req.file.buffer, { limitInputPixels: businessPosterPolicy.maxPixels }).metadata();
        if (!["jpeg", "png", "webp"].includes(info.format || "") || (info.pages || 1) > 1) throw new Error("Unsupported image");
      } catch { throw new ApiError(400, "Choose a valid, non-animated JPEG, PNG or WebP image under 40 megapixels"); }
      // Browser decoding respects EXIF orientation; validate the displayed shape.
      const sideways = [5, 6, 7, 8].includes(info.orientation || 1);
      const dimensionError = posterDimensionsError(
        (sideways ? info.height : info.width) || 0,
        (sideways ? info.width : info.height) || 0,
      );
      if (dimensionError) throw new ApiError(400, dimensionError);
      imagePath = await uploadAndCompressImage(req.file.buffer, "business-posters", req.file.originalname, { autoOrient: true });
    }
    const oldPath = existing?.imagePath;
    let saved;
    try {
      saved = existing ? await Object.assign(existing, value, imagePath ? { imagePath } : {}).save()
        : await BusinessPoster.create({ ...value, imagePath });
    } catch (error) {
      if (imagePath) await deleteLocalFile(imagePath).catch(() => undefined);
      throw error;
    }
    // Metadata is already committed. A storage cleanup failure must not turn success into a retry/duplicate.
    if (imagePath && oldPath) await deleteLocalFile(oldPath).catch(() => undefined);
    res.status(creating ? 201 : 200).json({ data: serialize(saved.toObject()) });
  }));
}
router.delete("/admin/business-posters/:id", asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid poster id");
  const poster = await BusinessPoster.findByIdAndDelete(req.params.id);
  if (!poster) throw new ApiError(404, "Poster not found");
  await deleteLocalFile(poster.imagePath).catch(() => undefined);
  res.json({ data: { deleted: true } });
}));
export default router;
