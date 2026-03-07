import { Types } from "mongoose";
import Business from "../models/Business";
import StaffProfile, { IStaffProfile } from "../models/StaffProfile";
import StaffService from "../models/StaffService";
import User from "../models/User";
import ApiError from "../utils/ApiError";

export const createStaffProfile = async ({
  ownerId,
  userId,
  businessId,
  services,
  overrides,
}: {
  ownerId: Types.ObjectId;
  userId: string;
  businessId: string;
  services?: string[];
  overrides?: Array<{ serviceId: string; price: number }>;
}): Promise<IStaffProfile> => {
  const business = await Business.findById(businessId);
  if (!business) throw new ApiError(404, "Business not found");
  if (String(business.ownerId) !== String(ownerId))
    throw new ApiError(403, "Only business owner can add staff");

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "Staff user not found");

  if (!user.roles.includes("staff")) {
    user.roles.push("staff");
    await user.save();
  }

  const profile = await StaffProfile.findOneAndUpdate(
    { staffId: user.firebaseUid, businessId },
    {
      staffId: user.firebaseUid,
      businessId,
      services: services || [],
      isActive: true,
    },
    { new: true, upsert: true },
  );

  if (overrides && overrides.length > 0) {
    await Promise.all(
      overrides.map((item) =>
        StaffService.findOneAndUpdate(
          { staffId: profile._id, serviceId: item.serviceId },
          { price: item.price },
          { upsert: true, new: true },
        ),
      ),
    );
  }

  return profile;
};

export const listStaffByBusiness = async (
  businessId: string,
  includeArchived = false,
): Promise<IStaffProfile[]> => {
  const staffProfiles = await StaffProfile.find({ businessId, ...(includeArchived ? {} : { isActive: true }) })
    .populate("services", "name duration basePrice category categoryName")
    .lean();

  if (!staffProfiles.length) {
    return [];
  }

  const staffIds = staffProfiles.map((profile) => String(profile.staffId));
  const users = await User.find({ firebaseUid: { $in: staffIds } })
    .select("fullName email roles firebaseUid profilePicture")
    .lean();

  const userByFirebaseUid = new Map(
    users.map((user) => [String(user.firebaseUid), user]),
  );

  return staffProfiles.map((profile) => ({
    ...profile,
    userId: userByFirebaseUid.get(String(profile.staffId)) || undefined,
  })) as unknown as IStaffProfile[];
};
