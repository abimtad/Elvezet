import { NextFunction, Request, Response } from "express";
import multer from "multer";
import ApiError from "../utils/ApiError";

const MAX_SCREENSHOT_SIZE_BYTES = 5 * 1024 * 1024;

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_SCREENSHOT_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("paymentScreenshot must be an image file."));
      return;
    }

    cb(null, true);
  },
});

export const parseBookingScreenshotUpload = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  uploader.single("paymentScreenshot")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(new ApiError(400, "paymentScreenshot must be 5MB or smaller."));
        return;
      }

      next(new ApiError(400, err.message));
      return;
    }

    if (err instanceof Error) {
      next(new ApiError(400, err.message));
      return;
    }

    next(new ApiError(400, "Invalid paymentScreenshot upload."));
  });
};
