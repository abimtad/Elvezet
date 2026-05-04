import mongoose from "mongoose";
import Availability from "../models/Availability";
import Booking from "../models/Booking";
import Business from "../models/Business";
import Category from "../models/Category";
import StaffProfile from "../models/StaffProfile";
import User from "../models/User";
import { getFirebaseAdmin } from "../config/firebase";
import ApiError from "../utils/ApiError";
import { toPublicUrl } from "./media.service";

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const generateTemporaryPassword = (): string => {
  return `Temp${Math.random().toString(36).slice(2, 10)}!`;
};

export const registerTenant = async (payload: {
  name?: string;
  shopName?: string;
  ownerEmail: string;
  genderTarget?: "male" | "female" | "all" | "unknown";
  ownerPassword?: string;
  ownerPhoneNumber?: string;
  type?: "shop" | "independent";
  businessCategoryId?: string;
  businessCategoryName?: string;
  latitude?: number;
  longitude?: number;
  addressString?: string;
  bufferRange?: number;
  travelRate?: number;
  minTravelFee?: number;
  idNumber?: string;
}) => {
  if (payload.genderTarget && !["male", "female", "all", "unknown"].includes(payload.genderTarget)) throw new ApiError(400, "Invalid business audience");
  const tenantName = payload.shopName || payload.name;
  if (!tenantName || !payload.ownerEmail) {
    throw new ApiError(
      400,
      "name/shopName and ownerEmail are required",
    );
  }

  const hasCoords =
    typeof payload.latitude === "number" &&
    Number.isFinite(payload.latitude) &&
    typeof payload.longitude === "number" &&
    Number.isFinite(payload.longitude);
  if (!hasCoords || !String(payload.addressString || "").trim()) {
    throw new ApiError(
      400,
      "All tenants require latitude, longitude, and display address.",
    );
  }

  const category = payload.businessCategoryId
    ? await Category.findById(payload.businessCategoryId)
    : payload.businessCategoryName
      ? await Category.findOne({
          name: new RegExp(
            `^${escapeRegExp(payload.businessCategoryName.trim())}$`,
            "i",
          ),
          isActive: true,
        })
      : null;

  if (!category || !category.isActive) {
    throw new ApiError(400, "A valid business category is required.");
  }

  const password = payload.ownerPassword || generateTemporaryPassword();
  const email = payload.ownerEmail.toLowerCase();

  const admin = getFirebaseAdmin();
  const firebaseUser = await admin.auth().createUser({
    email,
    password,
    displayName: tenantName,
  });

  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const [localUser] = await User.create(
        [
          {
            firebaseUid: firebaseUser.uid,
            fullName: tenantName,
            email,
            phoneNumber: payload.ownerPhoneNumber,
            roles: ["owner"],
            needsPasswordReset: true,
          },
        ],
        { session },
      );

      const businessPayload = {
        name: tenantName,
        genderTarget: payload.genderTarget || "unknown",
        ownerId: localUser._id,
        type: payload.type === "independent" ? "independent" : "shop",
        businessCategoryId: category._id,
        businessCategoryName: category.name,
        verificationStatus: "pending" as const,
        location: {
          type: "Point" as const,
          coordinates: [
            payload.longitude as number,
            payload.latitude as number,
          ] as [number, number],
        },
        homeLocation: {
          type: "Point" as const,
          coordinates: [
            payload.longitude as number,
            payload.latitude as number,
          ] as [number, number],
        },
        addressString: payload.addressString,
        bufferRange: payload.bufferRange ?? (payload.type === "independent" ? 7 : undefined),
        travelRate: payload.travelRate ?? (payload.type === "independent" ? 200 : undefined),
        minTravelFee: payload.minTravelFee ?? (payload.type === "independent" ? 100 : undefined),
        productsEnabled: false,
      };

      const [business] = await Business.create(
        [
          businessPayload,
        ],
        { session },
      );

      if (payload.type === "independent") {
        await StaffProfile.create(
          [
            {
              staffId: firebaseUser.uid,
              businessId: business._id,
              firstName: tenantName,
              email,
              role: "Owner",
              permissionLevel: "high",
              isBookableInCalendar: true,
              isActive: true,
              isOnlineVisible: true,
            },
          ],
          { session },
        );

        await Availability.insertMany(
          [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
            staffId: firebaseUser.uid,
            dayOfWeek,
            startTime: "09:00",
            endTime: "18:00",
          })),
          { session },
        );
      }

      return { user: localUser, business, password };
    });

    // eslint-disable-next-line no-console
    console.log(
      `[MOCK EMAIL] To: ${email} | Subject: Your Account is Ready | Body: Login with password: ${password}`,
    );

    return result;
  } catch (error) {
    // Compensate external user creation if Mongo transaction fails.
    try {
      await admin.auth().deleteUser(firebaseUser.uid);
    } catch {
      // Intentionally swallow compensation failures.
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

export const getGlobalStats = async (): Promise<{
  totalRevenue: number;
  cashRevenue: number;
  bankTransferRevenue: number;
  totalBookings: number;
  totalTenants: number;
  totalUsers: number;
  shopPerformance: Array<{
    businessId: string;
    name: string;
    bookings: number;
    revenue: number;
  }>;
}> => {
  const revenueRes = await Booking.aggregate([
    { $match: { paymentStatus: "paid" } },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$totalAmount" },
        cashRevenue: {
          $sum: {
            $cond: [{ $eq: ["$paymentMethod", "cash"] }, "$totalAmount", 0],
          },
        },
        bankTransferRevenue: {
          $sum: {
            $cond: [{ $ne: ["$paymentMethod", "cash"] }, "$totalAmount", 0],
          },
        },
      },
    },
  ]);

  const bookingCount = await Booking.countDocuments();
  const shopPerformance = await Booking.aggregate([
    { $match: { status: "completed", paymentStatus: "paid" } },
    {
      $group: {
        _id: "$businessId",
        bookings: { $sum: 1 },
        revenue: { $sum: "$totalAmount" },
      },
    },
    {
      $lookup: {
        from: "businesses",
        localField: "_id",
        foreignField: "_id",
        as: "business",
      },
    },
    { $unwind: { path: "$business", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        businessId: { $toString: "$_id" },
        name: { $ifNull: ["$business.name", "Unknown"] },
        bookings: 1,
        revenue: 1,
      },
    },
    { $sort: { revenue: -1, bookings: -1 } },
  ]);

  const totalRevenue = (revenueRes[0] && revenueRes[0].totalRevenue) || 0;
  const cashRevenue = (revenueRes[0] && revenueRes[0].cashRevenue) || 0;
  const bankTransferRevenue = (revenueRes[0] && revenueRes[0].bankTransferRevenue) || 0;
  const totalTenants = await Business.countDocuments();
  const totalUsers = await User.countDocuments();

  return { totalRevenue, cashRevenue, bankTransferRevenue, totalBookings: bookingCount, totalTenants, totalUsers, shopPerformance };
};

export const listTenants = async (filter?: {
  status?: "active" | "suspended" | "pending";
  type?: "shop" | "independent";
  limit?: number;
  skip?: number;
}) => {
  const q: Record<string, unknown> = {};
  if (filter?.type) q.type = filter.type;
  if (filter?.status) {
    if (filter.status === "active") q.verificationStatus = "active";
    else if (filter.status === "suspended") q.verificationStatus = "suspended";
    else if (filter.status === "pending") q.verificationStatus = "pending";
  }

  const tenants = await Business.find(q)
    .limit(filter?.limit ?? 50)
    .skip(filter?.skip ?? 0)
    .lean();

  return tenants;
};

export const updateTenantBusinessCategory = async (
  businessId: string,
  businessCategoryId: string,
) => {
  const category = await Category.findById(businessCategoryId);
  if (!category || !category.isActive) {
    throw new ApiError(400, "A valid business category is required.");
  }

  const business = await Business.findByIdAndUpdate(
    businessId,
    {
      $set: {
        businessCategoryId: category._id,
        businessCategoryName: category.name,
      },
    },
    { new: true },
  );

  if (!business) {
    throw new ApiError(404, "Tenant not found");
  }

  return business;
};

export const setTenantProductsEnabled = async (
  businessId: string,
  productsEnabled: boolean,
) => {
  const business = await Business.findByIdAndUpdate(
    businessId,
    { $set: { productsEnabled: Boolean(productsEnabled) } },
    { new: true },
  );
  if (!business) {
    throw new ApiError(404, "Tenant not found");
  }
  return business;
};

export const verifyIndependentBarber = async (
  businessId: string,
  idCardData: { idCardUrl?: string; idNumber?: string },
) => {
  const business = await Business.findById(businessId);
  if (!business) throw new ApiError(404, "Business not found");

  business.idCardUrl = idCardData.idCardUrl;
  business.idNumber = idCardData.idNumber;
  business.verificationStatus = "active";

  await business.save();
  return business;
};

export const listUsers = async () => {
  return User.find({ roles: { $in: ["customer"] } })
    .select("fullName email phoneNumber noShowCount isBanned createdAt")
    .sort({ createdAt: -1 })
    .lean();
};

export const toggleUserBan = async (userId: string, isBanned: boolean) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { isBanned } },
    { new: true },
  );
  if (!user) throw new ApiError(404, "User not found");
  return user;
};

export const listVerificationQueue = async () => {
  const businesses = await Business.find({
    type: "independent",
    verificationStatus: "pending",
  })
    .populate("ownerId", "fullName email phoneNumber")
    .sort({ createdAt: -1 })
    .lean();

  return businesses.map((business) => ({
    ...business,
    idCardUrl: business.idCardUrl ? toPublicUrl(business.idCardUrl) : "",
  }));
};

export default {
  registerTenant,
  getGlobalStats,
  listTenants,
  updateTenantBusinessCategory,
  setTenantProductsEnabled,
  verifyIndependentBarber,
  listUsers,
  toggleUserBan,
  listVerificationQueue,
};
