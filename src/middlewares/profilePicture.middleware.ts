import { NextFunction, Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import ApiError from "../utils/ApiError";
import { uploadProfilePicture } from "../services/media.service";

const MAX_PROFILE_PICTURE_SIZE_BYTES = 5 * 1024 * 1024;

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PROFILE_PICTURE_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/") && file.mimetype !== "application/octet-stream") {
      cb(new Error("profilePicture must be an image file."));
      return;
    }

    cb(null, true);
  },
});

const getUploadedProfileFile = (
  req: Request,
): Express.Multer.File | undefined => {
  if (!req.files || Array.isArray(req.files)) {
    return undefined;
  }

  return req.files.profileImage?.[0] ?? req.files.profilePicture?.[0];
};

export const parseProfilePictureUpload = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  uploader.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "profilePicture", maxCount: 1 },
  ])(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(new ApiError(400, "profilePicture must be 5MB or smaller."));
        return;
      }

      next(new ApiError(400, err.message));
      return;
    }

    if (err instanceof Error) {
      next(new ApiError(400, err.message));
      return;
    }

    next(new ApiError(400, "Invalid profilePicture upload."));
  });
};

export const uploadProfilePictureIfExists = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const profileFile = getUploadedProfileFile(req);

    if (!profileFile) {
      next();
      return;
    }

    const firebaseUid = req.user?.firebaseUid;

    if (!firebaseUid) {
      next(
        new ApiError(
          401,
          "Authenticated user is required to upload profile picture.",
        ),
      );
      return;
    }

    try {
      const metadata = await sharp(profileFile.buffer, { limitInputPixels: 25000000 }).metadata();
      if (!["jpeg", "png", "webp", "gif"].includes(metadata.format || "")) throw new Error("Unsupported image");
    } catch {
      throw new ApiError(400, "Choose a valid JPEG, PNG, WebP or GIF profile image (up to 25 megapixels).");
    }

    const profilePictureUrl = await uploadProfilePicture(
      profileFile.buffer,
      firebaseUid,
    );

    req.body.profilePicture = profilePictureUrl;
    next();
  } catch (error: unknown) {
    next(error);
  }
};
