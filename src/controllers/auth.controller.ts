import { Request, Response } from "express";
import Business from "../models/Business";
import User from "../models/User";
import asyncHandler from "../utils/asyncHandler";
import ApiError from "../utils/ApiError";
import {
  changeCurrentUserPassword,
  customerCheckoutRegister,
  signInWithIdToken,
  signUpWithFirebaseUid,
  updateCurrentUserProfile,
} from "../services/auth.service";
import { toPublicUrl } from "../services/media.service";
import { sendSuccess } from "../utils/httpResponse";

const withPublicProfilePicture = <T extends { profilePicture?: string | null }>(
  user: T | null | undefined,
): Record<string, unknown> | null | undefined => {
  if (!user) return user;
  const plain =
    typeof (user as { toObject?: () => Record<string, unknown> }).toObject ===
    "function"
      ? (user as unknown as { toObject: () => Record<string, unknown> }).toObject()
      : ({ ...(user as object) } as Record<string, unknown>);

  const picture = plain.profilePicture as string | null | undefined;
  return {
    ...plain,
    profilePicture: picture ? toPublicUrl(picture) : "",
  };
};

export const signUpController = asyncHandler(
  async (req: Request, res: Response) => {
    const { firebaseUid, fullName, email, phoneNumber } = req.body;
    const user = await signUpWithFirebaseUid({
      firebaseUid,
      fullName,
      email,
      phoneNumber,
    });

    sendSuccess(res, 201, withPublicProfilePicture(user));
  },
);

export const signInController = asyncHandler(
  async (req: Request, res: Response) => {
    const { idToken } = req.body;

    const result = await signInWithIdToken({
      idToken,
    });

    sendSuccess(res, 200, {
      user: withPublicProfilePicture(result.user),
      tokens: {
        idToken: result.idToken,
      },
    });
  },
);

export const customerCheckoutController = asyncHandler(
  async (req: Request, res: Response) => {
    const { firstName, lastName, phoneNumber, email, loginOnly } = req.body;
    const user = await customerCheckoutRegister({
      firstName,
      lastName,
      phoneNumber,
      email,
      loginOnly: Boolean(loginOnly),
    });

    sendSuccess(res, 200, {
      userId: String(user._id),
      firebaseUid: user.firebaseUid,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      user: withPublicProfilePicture(user),
    });
  },
);

export const getCurrentUser = asyncHandler(
  async (req: Request, res: Response) => {
    sendSuccess(res, 200, withPublicProfilePicture(req.user));
  },
);

export const devSeedInfoController = asyncHandler(
  async (_req: Request, res: Response) => {
    if (process.env.NODE_ENV === "production") {
      throw new ApiError(403, "Dev seed info is only available in development");
    }

    const owner =
      (await User.findOne({ email: "owner@test.com" })) ||
      (await User.findOne({ firebaseUid: "mustdash-owner-dev" }));

    if (!owner) {
      throw new ApiError(
        404,
        "Seeded owner not found. Run npm run seed:mustdash first.",
      );
    }

    const shop = await Business.findOne({ ownerId: owner._id, name: "Must Dash" });
    const customer =
      (await User.findOne({ email: "customer@test.com" })) ||
      (await User.findOne({ firebaseUid: "mustdash-customer-dev" }));
    const admin = await User.findOneAndUpdate(
      { firebaseUid: "mustdash-admin-dev" },
      {
        firebaseUid: "mustdash-admin-dev",
        fullName: "Test Admin",
        email: "admin@test.com",
        phoneNumber: "+251911000010",
        roles: ["admin"],
        isVerified: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const staffUsers = await User.find({
      firebaseUid: {
        $in: [
          "mustdash-staff-abebe",
          "mustdash-staff-solomon",
          "mustdash-staff-ruth",
        ],
      },
    }).select("_id firebaseUid fullName email");

    sendSuccess(res, 200, {
      ownerId: String(owner._id),
      firebaseUid: owner.firebaseUid,
      shopId: shop ? String(shop._id) : null,
      email: owner.email,
      ownerName: owner.fullName,
      customerId: customer ? String(customer._id) : null,
      customerFirebaseUid: customer?.firebaseUid ?? null,
      adminId: admin ? String(admin._id) : null,
      adminFirebaseUid: admin?.firebaseUid ?? null,
      staff: staffUsers.map((s) => ({
        id: String(s._id),
        firebaseUid: s.firebaseUid,
        fullName: s.fullName,
        email: s.email,
      })),
    });
  },
);

export const updateCurrentUserProfileController = asyncHandler(
  async (req: Request, res: Response) => {
    const { fullName, email, phoneNumber, profilePicture } = req.body;

    const user = await updateCurrentUserProfile({
      userId: req.user!._id,
      fullName,
      email,
      phoneNumber,
      profilePicture,
    });

    sendSuccess(res, 200, withPublicProfilePicture(user));
  },
);

export const changeCurrentUserPasswordController = asyncHandler(
  async (req: Request, res: Response) => {
    const { newPassword } = req.body;

    const user = await changeCurrentUserPassword({
      userId: req.user!._id,
      newPassword,
    });

    sendSuccess(
      res,
      200,
      withPublicProfilePicture(user),
      "Password updated successfully",
    );
  },
);
