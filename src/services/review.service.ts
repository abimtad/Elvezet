import { Types } from "mongoose";
import Booking from "../models/Booking";
import Business from "../models/Business";
import Product from "../models/Product";
import ProductReview from "../models/ProductReview";
import Review, { IReview } from "../models/Review";
import ApiError from "../utils/ApiError";
import { assertSafeText, assertCommunityConsent, publicReviewFilter } from "./content-safety.service";
import { invalidatePublicBusinessCache } from "./cache.service";

const reviewSortOption = (
  sort?: "latest" | "best" | "worst",
): Record<string, 1 | -1> => {
  if (sort === "best") return { rating: -1, createdAt: -1 };
  if (sort === "worst") return { rating: 1, createdAt: -1 };
  return { createdAt: -1 };
};

export const recalculateBusinessRating = async (
  businessId: string,
): Promise<number> => {
  const reviews = await Review.find({ businessId, isHidden: { $ne: true } }).select("rating");
  if (!reviews.length) {
    await Business.findByIdAndUpdate(businessId, { rating: 0 });
    await invalidatePublicBusinessCache();
    return 0;
  }

  const average =
    reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const rounded = Number(average.toFixed(2));
  await Business.findByIdAndUpdate(businessId, { rating: rounded });
  await invalidatePublicBusinessCache();
  return rounded;
};

export const createReview = async ({
  userId,
  businessId,
  rating,
  comment,
}: {
  userId: Types.ObjectId;
  businessId: string;
  rating: number;
  comment: string;
}): Promise<IReview> => {
  assertSafeText(comment);
  await assertCommunityConsent(userId);
  const business = await Business.findById(businessId);
  if (!business) throw new ApiError(404, "Business not found");

  const pastPaidVisit = await Booking.findOne({
    userId: String(userId),
    businessId,
    paymentStatus: "paid",
    status: "confirmed",
    endTime: { $lte: new Date() },
  }).select("_id");
  if (!pastPaidVisit) {
    throw new ApiError(403, "Review requires a past paid visit at this shop");
  }

  const review = await Review.findOneAndUpdate(
    { userId, businessId },
    { rating, comment },
    { new: true, upsert: true },
  );
  await recalculateBusinessRating(businessId);
  return review;
};

export const listReviewsByBusiness = async (
  businessId: string,
  sort?: "latest" | "best" | "worst",
  viewerId?: Types.ObjectId,
): Promise<IReview[]> => {
  return Review.find({ businessId, ...await publicReviewFilter(viewerId) })
    .sort(reviewSortOption(sort))
    .populate("userId", "fullName");
};

export const getReviewById = async (reviewId: string, viewerId?: Types.ObjectId): Promise<IReview> => {
  const review = await Review.findOne({ _id: reviewId, ...await publicReviewFilter(viewerId) }).populate("userId", "fullName");
  if (!review) throw new ApiError(404, "Review not found");
  if (review.isHidden) throw new ApiError(404, "Review not found");
  return review;
};

export const updateReview = async ({
  reviewId,
  requester,
  rating,
  comment,
}: {
  reviewId: string;
  requester: {
    _id: Types.ObjectId;
    roles: Array<"customer" | "staff" | "owner" | "admin" | "moderator">;
  };
  rating?: number;
  comment?: string;
}): Promise<IReview> => {
  const review = await Review.findById(reviewId);
  if (!review) throw new ApiError(404, "Review not found");

  const business = await Business.findById(review.businessId);
  const isAuthor = String(review.userId) === String(requester._id);
  const isBusinessOwner =
    requester.roles.includes("owner") &&
    business &&
    String(business.ownerId) === String(requester._id);

  if (!isAuthor) {
    throw new ApiError(403, "Not allowed to update this review");
  }
  await assertCommunityConsent(requester._id);

  if (rating !== undefined) review.rating = rating;
  if (comment !== undefined) { assertSafeText(comment); review.comment = comment; }
  await review.save();

  await recalculateBusinessRating(String(review.businessId));
  return review;
};

export const deleteReview = async ({
  reviewId,
  requester,
}: {
  reviewId: string;
  requester: {
    _id: Types.ObjectId;
    roles: Array<"customer" | "staff" | "owner" | "admin" | "moderator">;
  };
}): Promise<IReview> => {
  const review = await Review.findById(reviewId);
  if (!review) throw new ApiError(404, "Review not found");

  const business = await Business.findById(review.businessId);
  const isAuthor = String(review.userId) === String(requester._id);
  const isBusinessOwner =
    requester.roles.includes("owner") &&
    business &&
    String(business.ownerId) === String(requester._id);

  if (!isAuthor && !requester.roles.some(role => role === "admin" || role === "moderator")) {
    throw new ApiError(403, "Not allowed to delete this review");
  }

  await review.deleteOne();
  await recalculateBusinessRating(String(review.businessId));
  return review;
};

export const listMyReviewsForUser = async (userId: Types.ObjectId | string) => {
  const uid = new Types.ObjectId(String(userId));
  const shopReviews = await Review.find({ userId: uid })
    .sort({ createdAt: -1 })
    .populate("businessId", "name type logoUrl coverImageUrl addressString")
    .lean();

  const productReviews = await ProductReview.find({ userId: uid })
    .sort({ createdAt: -1 })
    .populate("businessId", "name type logoUrl coverImageUrl addressString")
    .populate("productId", "name imageUrl")
    .lean();

  const reviewedBusinessIds = new Set(
    shopReviews.map((row) => String((row.businessId as any)?._id || row.businessId)),
  );
  const reviewedProductIds = new Set(
    productReviews.map((row) => String((row.productId as any)?._id || row.productId)),
  );

  const bookings = await Booking.find({
    userId: String(userId),
    paymentStatus: "paid",
    status: { $nin: ["cancelled", "expired"] },
  })
    .sort({ startTime: -1 })
    .populate("businessId", "name type logoUrl coverImageUrl")
    .lean();

  const pendingByShop = new Map<string, Record<string, unknown>>();
  const pendingByProduct = new Map<string, Record<string, unknown>>();
  const now = Date.now();

  for (const booking of bookings) {
    const business = booking.businessId as unknown as
      | { _id?: unknown; name?: string; type?: string; logoUrl?: string; coverImageUrl?: string }
      | null;
    const shopId = business?._id
      ? String(business._id)
      : String(booking.businessId || "");
    const end = new Date(
      (booking.endTime as Date | undefined) || booking.startTime,
    ).getTime();
    const pastVisit =
      !Number.isNaN(end) && end <= now && booking.status === "confirmed";

    if (shopId && pastVisit && !reviewedBusinessIds.has(shopId) && !pendingByShop.has(shopId)) {
      pendingByShop.set(shopId, {
        kind: "shop",
        bookingId: String(booking._id),
        shopId,
        shopName: business?.name || "Shop",
        shopType: business?.type || "shop",
        logoUrl: business?.logoUrl || "",
        coverImageUrl: business?.coverImageUrl || "",
        startTime: booking.startTime,
        endTime: booking.endTime || booking.startTime,
      });
    }

    for (const item of booking.checkoutItems || []) {
      const productId = String(item.productId || "");
      if (!productId || reviewedProductIds.has(productId) || pendingByProduct.has(productId)) {
        continue;
      }
      pendingByProduct.set(productId, {
        kind: "product",
        bookingId: String(booking._id),
        productId,
        productName: item.name || "Product",
        shopId,
        shopName: business?.name || "Shop",
        shopType: business?.type || "shop",
        logoUrl: business?.logoUrl || "",
        coverImageUrl: business?.coverImageUrl || "",
        paidAt: booking.paidAt || booking.startTime,
      });
    }
  }

  // Resolve product names for any pending rows missing names
  const pendingProductIds = [...pendingByProduct.keys()].filter((id) =>
    Types.ObjectId.isValid(id),
  );
  if (pendingProductIds.length) {
    const products = await Product.find({ _id: { $in: pendingProductIds } })
      .select("name")
      .lean();
    for (const product of products) {
      const row = pendingByProduct.get(String(product._id));
      if (row && (!row.productName || row.productName === "Product")) {
        row.productName = product.name;
      }
    }
  }

  const mapShopReview = (row: any) => {
    const business = row.businessId as
      | {
          _id?: unknown;
          name?: string;
          type?: string;
          logoUrl?: string;
          coverImageUrl?: string;
          addressString?: string;
        }
      | null;
    return {
      id: String(row._id),
      kind: "shop" as const,
      rating: row.rating,
      comment: row.comment || "",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      shopId: business?._id ? String(business._id) : String(row.businessId),
      shopName: business?.name || "Shop",
      shopType: business?.type || "shop",
      logoUrl: business?.logoUrl || "",
      coverImageUrl: business?.coverImageUrl || "",
      shopAddress: business?.addressString || "",
    };
  };

  const mapProductReview = (row: any) => {
    const business = row.businessId as
      | {
          _id?: unknown;
          name?: string;
          type?: string;
          logoUrl?: string;
          coverImageUrl?: string;
          addressString?: string;
        }
      | null;
    const product = row.productId as { _id?: unknown; name?: string } | null;
    return {
      id: String(row._id),
      kind: "product" as const,
      rating: row.rating,
      comment: row.comment || "",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      verifiedPurchase: row.verifiedPurchase === true,
      productId: product?._id ? String(product._id) : String(row.productId),
      productName: product?.name || "Product",
      shopId: business?._id ? String(business._id) : String(row.businessId),
      shopName: business?.name || "Shop",
      shopType: business?.type || "shop",
      logoUrl: business?.logoUrl || "",
      coverImageUrl: business?.coverImageUrl || "",
      shopAddress: business?.addressString || "",
    };
  };

  const reviews = [
    ...shopReviews.map(mapShopReview),
    ...productReviews.map(mapProductReview),
  ].sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bt - at;
  });

  return {
    pending: [...pendingByShop.values(), ...pendingByProduct.values()],
    reviews,
  };
};
