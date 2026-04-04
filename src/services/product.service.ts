import { Types } from "mongoose";
import Booking from "../models/Booking";
import Business from "../models/Business";
import Product, { IProduct } from "../models/Product";
import ProductReview, { IProductReview } from "../models/ProductReview";
import StaffProfile from "../models/StaffProfile";
import User from "../models/User";
import ApiError from "../utils/ApiError";
import { toPublicUrl } from "./media.service";
import { assertSafeText, assertCommunityConsent, publicReviewFilter } from "./content-safety.service";

const mapProduct = (doc: any) => {
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  if (plain.imageUrl) {
    plain.imageUrl = toPublicUrl(plain.imageUrl);
  }
  plain.id = String(plain._id);
  return plain;
};

const assertSellPrivilege = async (businessId: string) => {
  const business = await Business.findById(businessId).select("productsEnabled name ownerId");
  if (!business) throw new ApiError(404, "Business not found");
  if (!business.productsEnabled) {
    throw new ApiError(
      403,
      "This shop is not allowed to sell products. Ask a super admin to enable selling.",
    );
  }
  return business;
};

const reviewSortOption = (
  sort?: "latest" | "best" | "worst",
): Record<string, 1 | -1> => {
  if (sort === "best") return { rating: -1, createdAt: -1 };
  if (sort === "worst") return { rating: 1, createdAt: -1 };
  return { createdAt: -1 };
};

/** Paid booking containing this product for the signed-in customer. */
export const findPaidProductPurchase = async (
  userId: Types.ObjectId | string,
  productId: string,
) => {
  const uid = String(userId);
  return Booking.findOne({
    userId: uid,
    paymentStatus: "paid",
    status: { $nin: ["cancelled", "expired"] },
    "checkoutItems.productId": new Types.ObjectId(productId),
  }).select("_id businessId checkoutItems paidAt");
};

const assertNotSellerOfProduct = async (
  userId: Types.ObjectId,
  businessId: Types.ObjectId | string,
) => {
  const business = await Business.findById(businessId).select("ownerId");
  if (!business) throw new ApiError(404, "Business not found");
  if (String(business.ownerId) === String(userId)) {
    throw new ApiError(403, "Sellers cannot review their own products");
  }
  const user = await User.findById(userId).select("firebaseUid");
  const staffIds = [String(userId)];
  if (user?.firebaseUid) staffIds.push(String(user.firebaseUid));
  const staff = await StaffProfile.findOne({
    businessId,
    staffId: { $in: staffIds },
    isActive: { $ne: false },
  }).select("_id");
  if (staff) {
    throw new ApiError(403, "Sellers cannot review their own products");
  }
};

export const recalculateProductRating = async (productId: string) => {
  const reviews = await ProductReview.find({ productId, isHidden: { $ne: true } }).select("rating");
  if (!reviews.length) {
    await Product.findByIdAndUpdate(productId, {
      ratingAverage: 0,
      ratingCount: 0,
    });
    return { ratingAverage: 0, ratingCount: 0 };
  }
  const average =
    reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const rounded = Number(average.toFixed(2));
  await Product.findByIdAndUpdate(productId, {
    ratingAverage: rounded,
    ratingCount: reviews.length,
  });
  return { ratingAverage: rounded, ratingCount: reviews.length };
};

export const listMarketplaceProducts = async (options?: {
  limit?: number;
  category?: string;
  businessId?: string;
}) => {
  const enabledBusinessIds = await Business.find({
    productsEnabled: true,
    verificationStatus: "active",
  }).distinct("_id");

  const filter: Record<string, unknown> = {
    isActive: true,
    businessId: { $in: enabledBusinessIds },
  };
  if (options?.businessId) {
    filter.businessId = options.businessId;
  }
  if (options?.category) {
    filter.category = new RegExp(`^${options.category}$`, "i");
  }

  const products = await Product.find(filter)
    .sort({ createdAt: -1 })
    .limit(options?.limit ?? 40)
    .populate("businessId", "name productsEnabled")
    .lean();

  return products.map(mapProduct);
};

export const getMarketplaceProductById = async (productId: string) => {
  const product = await Product.findById(productId)
    .populate("businessId", "name productsEnabled phoneNumber addressString")
    .lean();
  if (!product || !product.isActive) {
    throw new ApiError(404, "Product not found");
  }

  const business = product.businessId as any;
  if (!business?.productsEnabled) {
    throw new ApiError(404, "Product not found");
  }

  const reviews = await ProductReview.find({ productId, isHidden: { $ne: true } })
    .select("rating")
    .lean();
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const review of reviews) {
    const key = Math.min(5, Math.max(1, Math.round(review.rating))) as
      | 1
      | 2
      | 3
      | 4
      | 5;
    distribution[key] += 1;
  }

  return {
    ...mapProduct(product),
    ratingDistribution: distribution,
  };
};

const mapProductReviewRow = (review: any) => ({
  ...review,
  id: String(review._id),
  userName:
    (review.userId as any)?.fullName ||
    (review.userId as any)?.name ||
    "Customer",
  verifiedPurchase: review.verifiedPurchase === true,
});

export const listProductReviews = async (
  productId: string,
  sort?: "latest" | "best" | "worst",
  viewerId?: Types.ObjectId,
) => {
  const product = await Product.findById(productId).select("_id");
  if (!product) throw new ApiError(404, "Product not found");

  const reviews = await ProductReview.find({ productId, ...await publicReviewFilter(viewerId) })
    .sort(reviewSortOption(sort))
    .populate("userId", "fullName")
    .lean();

  return reviews.map(mapProductReviewRow);
};

export const listBusinessProductReviews = async (
  businessId: string,
  sort?: "latest" | "best" | "worst",
  viewerId?: Types.ObjectId,
) => {
  const business = await Business.findById(businessId).select("_id");
  if (!business) throw new ApiError(404, "Business not found");

  const reviews = await ProductReview.find({
    businessId,
    ...await publicReviewFilter(viewerId),
  })
    .sort(reviewSortOption(sort))
    .populate("userId", "fullName")
    .populate("productId", "name")
    .lean();

  return reviews.map((review) => {
    const product = review.productId as any;
    return {
      ...mapProductReviewRow(review),
      productId: product?._id ? String(product._id) : String(review.productId),
      productName: product?.name || "Product",
      kind: "product" as const,
    };
  });
};

export const upsertProductReview = async ({
  userId,
  productId,
  rating,
  comment,
}: {
  userId: Types.ObjectId;
  productId: string;
  rating: number;
  comment?: string;
}): Promise<IProductReview> => {
  assertSafeText(comment || "");
  await assertCommunityConsent(userId);
  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    throw new ApiError(404, "Product not found");
  }
  await assertSellPrivilege(String(product.businessId));

  const existing = await ProductReview.findOne({ userId, productId });
  if (!existing) {
    await assertNotSellerOfProduct(userId, product.businessId);
    const purchase = await findPaidProductPurchase(userId, productId);
    if (!purchase) {
      throw new ApiError(
        403,
        "Review requires a paid purchase of this product",
      );
    }
  }

  const review = await ProductReview.findOneAndUpdate(
    { userId, productId },
    {
      $set: {
        rating,
        comment: comment?.trim() || "",
        businessId: product.businessId,
        ...(existing ? {} : { verifiedPurchase: true }),
      },
      $setOnInsert: {
        userId,
        productId,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  await recalculateProductRating(productId);
  return review;
};

export const deleteProductReview = async ({
  reviewId,
  requesterId,
  roles,
}: {
  reviewId: string;
  requesterId: Types.ObjectId;
  roles: string[];
}) => {
  const review = await ProductReview.findById(reviewId);
  if (!review) throw new ApiError(404, "Review not found");

  const isOwner = String(review.userId) === String(requesterId);
  const isAdmin = roles.includes("admin") || roles.includes("moderator");
  if (!isOwner && !isAdmin) {
    throw new ApiError(403, "Not allowed to delete this review");
  }

  const productId = String(review.productId);
  await review.deleteOne();
  await recalculateProductRating(productId);
};

export const assertBusinessCanSell = assertSellPrivilege;

export type { IProduct };
