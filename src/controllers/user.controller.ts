import { Request, Response } from "express";
import asyncHandler from "../utils/asyncHandler";
import { registerDeviceToken } from "../services/user.service";
import { sendSuccess } from "../utils/httpResponse";

export const registerDeviceTokenController = asyncHandler(
  async (req: Request, res: Response) => {
    const deviceToken = await registerDeviceToken({
      userId: req.user!._id,
      fcmToken: req.body.fcmToken,
      app: req.body.app,
    });

    sendSuccess(res, 201, deviceToken);
  },
);
