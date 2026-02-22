import User, { IUser } from "../models/User";
import CustomerCredential from "../models/CustomerCredential";
import { getFirebaseAdmin } from "../config/firebase";
import ApiError from "../utils/ApiError";
import { Types } from "mongoose";
import { deleteLocalFile } from "./media.service";

export const syncUserFromFirebase = async ({
  firebaseUid,
  fullName,
  email,
  phoneNumber,
}: {
  firebaseUid: string;
  fullName?: string;
  email?: string;
  phoneNumber?: string;
}): Promise<IUser> => {
  if (await User.exists({ firebaseUid, deletionPendingAt: { $exists: true } })) {
    throw new ApiError(403, "Account deletion is in progress");
  }

  // Token claims identify the session; they may contain an old display name or
  // email. Profile edits are authoritative until an explicit profile update.
  const user = await User.findOne({
    firebaseUid, deletionPendingAt: { $exists: false },
  });
  // Authentication refresh must never recreate a deleted profile.
  if (!user) throw new ApiError(404, "Register an account before signing in");
  return user;
};

export const signUpWithFirebaseUid = async ({
  firebaseUid,
  fullName,
  email,
  phoneNumber,
}: {
  firebaseUid: string;
  fullName: string;
  email: string;
  phoneNumber: string;
}): Promise<IUser> => {
  try {
    const admin = getFirebaseAdmin();
    const normalizedEmail = email.toLowerCase();

    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      throw new ApiError(
        400,
        "A user with this email already exists in our system.",
      );
    }

    await admin.auth().getUser(firebaseUid);

    return await User.create({
      firebaseUid,
      fullName,
      email: normalizedEmail,
      phoneNumber,
      roles: ["customer"],
    });
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      throw error;
    }

    const mongoError = error as { code?: number };
    if (mongoError.code === 11000) {
      throw new ApiError(400, "User already registered.");
    }

    throw new ApiError(500, "Failed to sign up user");
  }
};

export const signInWithIdToken = async ({
  idToken,
}: {
  idToken: string;
}): Promise<{
  user: IUser;
  idToken: string;
}> => {
  const user = await verifySession(idToken);

  return {
    user,
    idToken,
  };
};

export const verifySession = async (idToken: string): Promise<IUser> => {
  try {
    const admin = getFirebaseAdmin();
    // 1) Verify the Firebase ID token.
    const decodedToken = await admin.auth().verifyIdToken(idToken, true);
    const firebaseId = decodedToken.uid;

    // 2) Look up the local user profile by Firebase UID.
    const user = await User.findOne({ firebaseUid: firebaseId });

    if (!user) {
      throw new ApiError(404, "User not found in local database");
    }
    if (user.isBanned || user.deletionPendingAt) throw new ApiError(403, "Account unavailable");

    // 3) Return user profile for API response.
    return user;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(401, "Invalid or expired Firebase ID token");
  }
};

const normalizeEthiopianPhone = (raw: string): string => {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("251") && digits.length >= 12) {
    return `+${digits.slice(0, 12)}`;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `+251${digits.slice(1)}`;
  }
  if (digits.length === 9 && (digits.startsWith("9") || digits.startsWith("7"))) {
    return `+251${digits}`;
  }
  if (digits.length >= 9) {
    return `+${digits}`;
  }
  throw new ApiError(400, "Enter a valid Ethiopian phone number");
};

/** Soft phone checkout auth — no SMS OTP. Upserts customer for marketplace pay. */
export const customerCheckoutRegister = async ({
  firstName,
  lastName,
  phoneNumber,
  email,
  loginOnly = false,
}: {
  firstName?: string;
  lastName?: string;
  phoneNumber: string;
  email?: string;
  loginOnly?: boolean;
}): Promise<IUser> => {
  const phone = normalizeEthiopianPhone(phoneNumber);
  const fullName = [firstName?.trim() || "", (lastName || "").trim()]
    .filter(Boolean)
    .join(" ");
  const phoneDigits = phone.replace(/\D/g, "");
  const syntheticEmail = `${phoneDigits}@customers.barberos.local`;
  const normalizedEmail = email?.trim()
    ? email.trim().toLowerCase()
    : syntheticEmail;

  let user = await User.findOne({ phoneNumber: phone });
  if (!user && email?.trim()) {
    user = await User.findOne({ email: normalizedEmail });
  }
  if (user?.deletionPendingAt || user?.isBanned) throw new ApiError(403, "This account is unavailable");

  if (!user) {
    if (loginOnly) {
      throw new ApiError(
        404,
        "No account found for this phone number. Sign up first.",
      );
    }
    const firebaseUid = `phone-customer-${phoneDigits}`;
    try {
      user = await User.create({
        firebaseUid,
        fullName: fullName || "Customer",
        email: normalizedEmail,
        phoneNumber: phone,
        roles: ["customer"],
        isVerified: true,
      });
    } catch (error: unknown) {
      const mongoError = error as { code?: number };
      if (mongoError.code === 11000) {
        user = await User.findOne({ firebaseUid });
        if (!user) throw new ApiError(400, "Could not create customer account");
      } else {
        throw error;
      }
    }
  } else {
    user.fullName = fullName || user.fullName;
    user.phoneNumber = phone;
    if (email?.trim()) {
      user.email = normalizedEmail;
    }
    await user.save();
  }

  return user!;
};

export const updateCurrentUserProfile = async ({
  userId,
  fullName,
  email,
  phoneNumber,
  profilePicture,
}: {
  userId: Types.ObjectId;
  fullName?: string;
  email?: string;
  phoneNumber?: string;
  profilePicture?: string;
}): Promise<IUser> => {
  const updates: Record<string, unknown> = {};
  const existingUser = await User.findById(userId).select("profilePicture phoneNumber");

  if (!existingUser) {
    throw new ApiError(404, "User not found in local database");
  }

  if (fullName !== undefined) {
    updates.fullName = fullName;
  }

  if (email !== undefined) {
    const normalizedEmail = email.toLowerCase();
    const existingEmail = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: userId },
    });

    if (existingEmail) {
      throw new ApiError(
        400,
        "A user with this email already exists in our system.",
      );
    }

    updates.email = normalizedEmail;
  }

  if (phoneNumber !== undefined) {
    if (await CustomerCredential.exists({ userId }) && phoneNumber !== existingUser.phoneNumber) throw new ApiError(409, "Phone login is linked to your current number. Contact support before changing it.");
    updates.phoneNumber = phoneNumber;
  }

  if (profilePicture !== undefined) {
    updates.profilePicture = profilePicture;
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(
      400,
      "Provide at least one profile field or profileImage file to update.",
    );
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $set: updates },
    { new: true },
  );

  if (!updatedUser) {
    throw new ApiError(404, "User not found in local database");
  }

  const previousPicture = existingUser.profilePicture;
  if (profilePicture !== undefined && previousPicture?.startsWith("/uploads/") && previousPicture !== profilePicture) {
    await deleteLocalFile(previousPicture).catch(() => undefined);
  }

  return updatedUser;
};

export const changeCurrentUserPassword = async ({
  userId,
  newPassword,
}: {
  userId: Types.ObjectId;
  newPassword: string;
}): Promise<IUser> => {
  const trimmedPassword = newPassword.trim();
  if (trimmedPassword.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters long");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found in local database");
  }

  const admin = getFirebaseAdmin();
  if (await CustomerCredential.exists({ userId })) throw new ApiError(400, "Use Profile > Phone login password to change your customer password.");
  await admin.auth().updateUser(user.firebaseUid, { password: trimmedPassword });

  user.needsPasswordReset = false;
  await user.save();

  return user;
};

/** Google login explicitly enrolls new customers using verified Firebase claims. */
export const signInWithGoogleToken = async (idToken: string): Promise<IUser> => {
  const decoded = await getFirebaseAdmin().auth().verifyIdToken(idToken, true).catch(() => {
    throw new ApiError(401, "Google session expired or invalid. Please sign in again.");
  });
  if (decoded.firebase.sign_in_provider !== "google.com" || !decoded.email || !decoded.email_verified) {
    throw new ApiError(401, "A verified Google sign-in is required");
  }
  const existing = await User.findOne({ firebaseUid: decoded.uid });
  if (existing) {
    if (existing.isBanned || existing.deletionPendingAt) throw new ApiError(403, "Account unavailable");
    return existing;
  }
  // Never merge a different identity merely because its email matches.
  if (await User.exists({ email: decoded.email.toLowerCase() })) {
    throw new ApiError(409, "An account with this email already exists. Sign in using your existing method.");
  }
  try {
    return await User.create({firebaseUid: decoded.uid, fullName: decoded.name || "Customer",
      email: decoded.email.toLowerCase(), roles: ["customer"]});
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const concurrent = await User.findOne({firebaseUid: decoded.uid});
      if (concurrent && !concurrent.isBanned && !concurrent.deletionPendingAt) return concurrent;
      throw new ApiError(409, "Account unavailable. Please try signing in again.");
    }
    throw error;
  }
};
