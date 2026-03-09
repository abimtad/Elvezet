import StaffProfile from "../models/StaffProfile";
import { IUser } from "../models/User";
import { Types } from "mongoose";

export const hasActiveShopMembership = async (businessId: string | Types.ObjectId, user: IUser): Promise<boolean> =>
  Boolean(await StaffProfile.exists({ businessId, staffId: { $in: [String(user._id), user.firebaseUid] }, isActive: true }));
