import { Types } from "mongoose";
import Favorite from "../models/Favorite";
import Business from "../models/Business";
import ApiError from "../utils/ApiError";

type BusinessLean = {
  _id: Types.ObjectId;
  name?: string;
  type?: string;
  addressString?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  rating?: number;
  isVisible?: boolean;
  verificationStatus?: string;
};

export const listFavoritesForUser = async (userId: Types.ObjectId | string) => {
  const rows = await Favorite.find({ userId })
    .sort({ createdAt: -1 })
    .populate(
      "businessId",
      "name type addressString logoUrl coverImageUrl rating isVisible verificationStatus",
    )
    .lean();

  const favorites = [];
  for (const row of rows) {
    const business = row.businessId as unknown as BusinessLean | null;
    if (!business?._id) continue;
    if (business.isVisible === false) continue;
    if (business.verificationStatus === "suspended") continue;
    favorites.push({
      id: String(business._id),
      businessId: String(business._id),
      name: String(business.name || "Shop"),
      type: String(business.type || "shop"),
      addressString: business.addressString
        ? String(business.addressString)
        : "",
      logoUrl: business.logoUrl ? String(business.logoUrl) : "",
      coverImageUrl: business.coverImageUrl
        ? String(business.coverImageUrl)
        : "",
      imageUrl:
        (business.coverImageUrl && String(business.coverImageUrl)) ||
        (business.logoUrl && String(business.logoUrl)) ||
        "",
      rating: Number(business.rating || 0),
      favoritedAt: row.createdAt,
    });
  }
  return favorites;
};

export const addFavorite = async (
  userId: Types.ObjectId | string,
  businessId: string,
) => {
  if (!Types.ObjectId.isValid(businessId)) {
    throw new ApiError(400, "Invalid business");
  }
  const business = await Business.findById(businessId).select(
    "isVisible verificationStatus",
  );
  if (!business || business.isVisible === false) {
    throw new ApiError(404, "Business not found");
  }
  if (business.verificationStatus === "suspended") {
    throw new ApiError(404, "Business not found");
  }

  await Favorite.findOneAndUpdate(
    { userId, businessId },
    { $setOnInsert: { userId, businessId } },
    { upsert: true, new: true },
  );
  return listFavoritesForUser(userId);
};

export const removeFavorite = async (
  userId: Types.ObjectId | string,
  businessId: string,
) => {
  if (!Types.ObjectId.isValid(businessId)) {
    throw new ApiError(400, "Invalid business");
  }
  await Favorite.deleteOne({ userId, businessId });
  return listFavoritesForUser(userId);
};
