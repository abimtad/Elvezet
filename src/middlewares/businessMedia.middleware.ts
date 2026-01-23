import { NextFunction, Request, Response } from "express";
import multer from "multer";
import ApiError from "../utils/ApiError";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (allowedMimeTypes.has(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(new Error("Only JPEG, PNG, WebP, GIF, and AVIF images are allowed"));
  },
});

export const parseBusinessSingleImageUpload =
  (fieldName = "image") =>
  (req: Request, res: Response, next: NextFunction): void => {
    uploader.single(fieldName)(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          next(new ApiError(400, "Image must be 10MB or smaller."));
          return;
        }

        next(new ApiError(400, err.message));
        return;
      }

      if (err instanceof Error) {
        next(new ApiError(400, err.message));
        return;
      }

      next(new ApiError(400, "Invalid image upload."));
    });
  };

export const parseBusinessGalleryUpload = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  uploader.array("images", 10)(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(new ApiError(400, "Each image must be 10MB or smaller."));
        return;
      }

      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        next(new ApiError(400, "Upload up to 10 images at a time."));
        return;
      }

      next(new ApiError(400, err.message));
      return;
    }

    if (err instanceof Error) {
      next(new ApiError(400, err.message));
      return;
    }

    next(new ApiError(400, "Invalid gallery upload."));
  });
};
