import { Types } from "mongoose";
import ApiError from "../utils/ApiError";
import User from "../models/User";
import Review from "../models/Review";
import ProductReview from "../models/ProductReview";
import DiscoverVideo from "../models/DiscoverVideo";
import Message from "../models/Message";
import Business from "../models/Business";
import ContentReport from "../models/ContentReport";
import { recalculateBusinessRating } from "./review.service";
import { recalculateProductRating } from "./product.service";
import { invalidatePublicBusinessCache } from "./cache.service";

export const assertSafeText = (text: string) => {
  if (/\b(kill yourself|heil hitler|nigger|faggot|child porn)\b/i.test(text.normalize("NFKC"))) {
    throw new ApiError(400, "This content violates our community guidelines");
  }
};

export const assertCommunityConsent = async (userId: Types.ObjectId) => {
  const user = await User.findById(userId).select("communityGuidelinesAcceptedAt isBanned deletionPendingAt");
  if (!user || user.isBanned || user.deletionPendingAt) throw new ApiError(403, "Account unavailable");
  if (!user.communityGuidelinesAcceptedAt) throw new ApiError(403, "Accept the community guidelines before posting");
};

export const contentTarget = async (type: string, id: string) => {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid content ID");
  switch (type) {
    case "review": return Review.findById(id);
    case "product_review": return ProductReview.findById(id);
    case "discover_video": return DiscoverVideo.findById(id);
    case "message": return Message.findById(id);
    case "business": return Business.findById(id);
    default: throw new ApiError(400, "Invalid content type");
  }
};

export const reportContent = async (reporterId: Types.ObjectId, input: Record<string, unknown>) => {
  const { targetType, targetId, reason, details = "" } = input;
  if (typeof targetType !== "string" || typeof targetId !== "string" || typeof reason !== "string" ||
      !["harassment", "hate", "sexual", "violence", "spam", "misleading", "other"].includes(reason) ||
      typeof details !== "string" || details.length > 1000) throw new ApiError(400, "Invalid report");
  const target = await contentTarget(targetType, targetId);
  if (!target) throw new ApiError(404, "Content not found");
  if (targetType === "message") {
    const booking = await (await import("../models/Booking")).default.findById((target as any).bookingId);
    const business = booking && await Business.findById(booking.businessId);
    if (!booking || ![String(booking.userId), String(business?.ownerId)].includes(String(reporterId))) {
      throw new ApiError(403, "You can only report messages in your conversations");
    }
  }
  return ContentReport.findOneAndUpdate({ reporterId, targetType, targetId },
    { $setOnInsert: { reporterId, targetType, targetId, reason, details, status: "open" } }, { upsert: true, new: true });
};

export const blockUser = async (requesterId: Types.ObjectId, targetId: string) => {
  if (!Types.ObjectId.isValid(targetId) || String(requesterId) === targetId) throw new ApiError(400, "Invalid user to block");
  if (!await User.exists({ _id: targetId })) throw new ApiError(404, "User not found");
  await User.updateOne({ _id: requesterId }, { $addToSet: { blockedUsers: targetId } });
};

export const publicReviewFilter = async (viewerId?: Types.ObjectId) => {
  const banned = await User.find({ $or: [{ isBanned: true }, { deletionPendingAt: { $exists: true } }] }).distinct("_id");
  const viewer = viewerId ? await User.findById(viewerId).select("blockedUsers") : null;
  return { isHidden: { $ne: true }, userId: { $nin: [...banned, ...(viewer?.blockedUsers || [])] } };
};

export const resolveContentReport = async (id: string, action: string, moderatorId: Types.ObjectId) => {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "Invalid report ID");
  if (!["dismiss", "remove"].includes(action)) throw new ApiError(400, "Invalid moderation action");
  const report = await ContentReport.findById(id);
  if (!report) throw new ApiError(404, "Report not found");
  if (report.status !== "open") throw new ApiError(409, "Report already resolved");
  const target = await contentTarget(report.targetType, String(report.targetId));
  if (action === "remove" && target) {
    switch (report.targetType) {
      case "review":
        await Review.updateOne({ _id: target._id }, { isHidden: true });
        await recalculateBusinessRating(String((target as any).businessId)); break;
      case "product_review":
        await ProductReview.updateOne({ _id: target._id }, { isHidden: true });
        await recalculateProductRating(String((target as any).productId)); break;
      case "discover_video": await DiscoverVideo.updateOne({ _id: target._id }, { isActive: false }); break;
      case "business": await Business.updateOne({ _id: target._id }, { isVisible: false, verificationStatus: "suspended" }); break;
      case "message": await Message.updateOne({ _id: target._id }, { text: "[Removed by moderation]", $unset: { image: 1 } }); break;
    }
  }
  report.status = action === "remove" ? "removed" : "dismissed";
  if (report.targetType === "business") await invalidatePublicBusinessCache();
  report.resolvedAt = new Date(); report.resolvedBy = moderatorId;
  await report.save();
  return report;
};
