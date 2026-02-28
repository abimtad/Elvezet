import { Types } from "mongoose";
import { saveDeviceToken } from "./notification.service";
import User from "../models/User";

export const registerDeviceToken = async ({
  userId,
  fcmToken,
  app,
}: {
  userId: Types.ObjectId;
  fcmToken: string;
  app?: "customer" | "business" | "independent";
}) => {
  return saveDeviceToken(userId, fcmToken, app);
};

export const findUserByFirebaseUid = async (firebaseUid: string) => {
  return User.findOne({ firebaseUid }).exec();
};
