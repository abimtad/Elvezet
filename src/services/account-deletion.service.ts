import { Types } from "mongoose";
import User from "../models/User";
import CustomerCredential from "../models/CustomerCredential";
import AccountDeletion from "../models/AccountDeletion";
import Booking from "../models/Booking";
import Client from "../models/Client";
import Review from "../models/Review";
import ProductReview from "../models/ProductReview";
import Notification from "../models/Notification";
import DeviceToken from "../models/DeviceToken";
import Message from "../models/Message";
import Business from "../models/Business";
import StaffProfile from "../models/StaffProfile";
import StaffService from "../models/StaffService";
import Availability from "../models/Availability";
import Absence from "../models/Absence";
import ContentReport from "../models/ContentReport";
import SmsMessage from "../models/SmsMessage";
import SmsSubscription from "../models/SmsSubscription";
import Favorite from "../models/Favorite";
import { normalizeSmsPhone } from "./sms-provider";
import { getFirebaseAdmin } from "../config/firebase";
import { deleteLocalFile } from "./media.service";
import ApiError from "../utils/ApiError";
import { recalculateBusinessRating } from "./review.service";
import { recalculateProductRating } from "./product.service";
import { invalidatePublicBusinessCache } from "./cache.service";

export const processAccountDeletion = async (requestId: string): Promise<boolean> => {
  const now = new Date();
  const request = await AccountDeletion.findOneAndUpdate({
    _id: requestId, status: "pending",
    $or: [{ processingUntil: { $exists: false } }, { processingUntil: { $lt: now } }],
  }, { $set: { processingUntil: new Date(Date.now() + 5 * 60 * 1000) }, $inc: { attempts: 1 } }, { new: true });
  if (!request) return false;
  let stage = "authentication";
  try {
    const user = await User.findById(request.userId);
    if (user) {
      const id = String(user._id);
      const identities = [id, user.firebaseUid];
      // Keep the profile locked until external authentication and every cleanup step succeed.
      await User.updateOne({ _id: user._id }, { deletionPendingAt: now });
      if (!(process.env.NODE_ENV === "development" && /^(qa-|mustdash-|phone-customer-)/.test(user.firebaseUid))) {
        try { await getFirebaseAdmin().auth().deleteUser(user.firebaseUid); }
        catch (error) { if ((error as { code?: string }).code !== "auth/user-not-found") throw error; }
      }
      const bookings = await Booking.find({ userId: { $in: identities } }).select("clientId paymentScreenshotUrl");
      const messages = await Message.find({ senderId: { $in: identities } }).select("image");
      const profiles = await StaffProfile.find({ staffId: { $in: identities } });
      identities.push(...profiles.map(profile => String(profile._id)));
      const ownedBusinesses = await Business.find({ ownerId: user._id });
      const smsPhone = normalizeSmsPhone(user.phoneNumber);
      await SmsMessage.deleteMany({ $or: [
        { businessId: { $in: ownedBusinesses.map(b => b._id) } },
        { bookingId: { $in: bookings.map(b => b._id) } },
        ...(smsPhone ? [{ toPhone: smsPhone }] : []),
      ] });
      await SmsSubscription.deleteMany({ businessId: { $in: ownedBusinesses.map(b => b._id) } });
      const filePaths = [user.profilePicture, ...bookings.map(b => b.paymentScreenshotUrl),
        ...messages.map(m => m.image), ...profiles.map(p => p.profilePicture),
        ...ownedBusinesses.flatMap(b => [b.idCardUrl, b.logoUrl, b.coverImageUrl, ...(b.galleryUrls || [])])];
      stage = "uploaded_files";
      for (const file of filePaths) if (file?.startsWith("/uploads/")) await deleteLocalFile(file);
      stage = "personal_records";
      await DeviceToken.deleteMany({ userId: user._id });
      await Notification.deleteMany({ userId: user._id });
      await Favorite.deleteMany({ userId: user._id });
      const reviewBusinesses = await Review.find({ userId: user._id }).distinct("businessId");
      const reviewProducts = await ProductReview.find({ userId: user._id }).distinct("productId");
      await Review.deleteMany({ userId: user._id });
      await ProductReview.deleteMany({ userId: user._id });
      for (const businessId of reviewBusinesses) await recalculateBusinessRating(String(businessId));
      for (const productId of reviewProducts) await recalculateProductRating(String(productId));
      await Message.deleteMany({ senderId: { $in: identities } });
      await StaffService.deleteMany({ staffId: { $in: profiles.map(p => p._id) } });
      await StaffProfile.deleteMany({ staffId: { $in: identities } });
      await Availability.deleteMany({ staffId: { $in: identities } });
      await Absence.deleteMany({ staffId: { $in: identities } });
      const clientSelectors: Record<string, unknown>[] = [{ _id: { $in: bookings.map(b => b.clientId).filter(Boolean) } }];
      if (user.phoneNumber) clientSelectors.push({ phoneNumber: user.phoneNumber });
      if (user.email && !user.email.endsWith(".local")) clientSelectors.push({ email: user.email });
      const clients = await Client.find({ $or: clientSelectors }).select("_id");
      for (const client of clients) await Client.updateOne({ _id: client._id }, {
        $set: { fullName: "Deleted customer", phoneNumber: `deleted-${client._id}` }, $unset: { email: 1, notes: 1 },
      });
      await Booking.deleteMany({ userId: { $in: identities }, paymentStatus: { $ne: "paid" } });
      await Booking.updateMany({ userId: { $in: identities } }, {
        $set: { userId: "deleted", retainedUntil: new Date(Date.now() + 730 * 86400000) },
        $unset: { clientId: 1, appointmentNotes: 1, paymentScreenshotUrl: 1, cancellationReason: 1 },
      });
      await Booking.updateMany({ staffId: { $in: identities } }, { $set: { staffId: "deleted" } });
      await Booking.updateMany({ "staffPlan.staffId": { $in: identities } },
        { $set: { "staffPlan.$[staff].staffId": "deleted" } }, { arrayFilters: [{ "staff.staffId": { $in: identities } }] });
      await Booking.updateMany({ cancelledBy: { $in: identities } }, { $unset: { cancelledBy: 1 } });
      await User.updateMany({ blockedUsers: user._id }, { $pull: { blockedUsers: user._id } });
      await ContentReport.deleteMany({ reporterId: user._id });
      await ContentReport.updateMany({ resolvedBy: user._id }, { $unset: { resolvedBy: 1 } });
      await Business.updateMany({ ownerId: user._id }, {
        $set: { name: "Closed business", ownerId: new Types.ObjectId(), isVisible: false,
          productsEnabled: false, verificationStatus: "suspended", location: { type: "Point", coordinates: [0, 0] } },
        $unset: { description: 1, homeLocation: 1, logoUrl: 1, coverImageUrl: 1, instagramUrl: 1,
          tiktokUrls: 1, mediaLinks: 1, galleryUrls: 1, idCardUrl: 1, idNumber: 1, addressString: 1, smsContactPhone: 1 },
      });
      await CustomerCredential.deleteMany({ userId: user._id });
      await User.deleteOne({ _id: user._id });
    }
    stage = "public_cache";
    await invalidatePublicBusinessCache();
    await AccountDeletion.updateOne({ _id: request._id }, {
      $set: { status: "complete", completedAt: new Date() }, $unset: { userId: 1, contact: 1, processingUntil: 1, nextAttemptAt: 1, lastFailureStage: 1 },
    });
    return true;
  } catch {
    await AccountDeletion.updateOne({ _id: request._id }, {
      $unset: { processingUntil: 1 },
      $set: { lastFailureStage: stage, nextAttemptAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(request.attempts - 1, 6))) },
    });
    console.warn(`Account deletion ${request._id} will retry after ${stage} cleanup`);
    return false;
  }
};

export const requestAccountDeletion = async (userId: Types.ObjectId) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "Account not found");
  const request = await AccountDeletion.findOneAndUpdate({ userId },
    { $setOnInsert: { userId, status: "pending" } }, { upsert: true, new: true });
  await User.updateOne({ _id: userId }, { deletionPendingAt: new Date() });
  let timer: NodeJS.Timeout | undefined;
  let complete: boolean;
  try {
    // A durable job keeps running if cleanup outlasts the interactive request.
    complete = await Promise.race([
      processAccountDeletion(String(request._id)),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 5000); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
  return { requestId: request._id, status: complete ? "complete" : "pending" };
};

export const startAccountDeletionWorker = () => {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const requests = await AccountDeletion.find({ status: "pending", $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: new Date() } }] }).sort({ updatedAt: 1 }).limit(20);
      for (const request of requests) await processAccountDeletion(String(request._id));
    } catch { console.error("Account deletion cleanup will retry"); }
    finally { running = false; }
  };
  void run();
  const timer = setInterval(() => void run(), 60000);
  timer.unref();
};
