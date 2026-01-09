import { NextFunction, Request, Response } from "express";
import { DecodedIdToken } from "firebase-admin/auth";
import { Types } from "mongoose";
import { getFirebaseAdmin } from "../config/firebase";
import User from "../models/User";
import ApiError from "../utils/ApiError";
import { syncUserFromFirebase } from "../services/auth.service";

const resolveDevUser = async (devUserId: string) => {
  if (Types.ObjectId.isValid(devUserId)) {
    const byId = await User.findById(devUserId);
    if (byId) return byId;
  }

  return User.findOne({ firebaseUid: devUserId });
};

const authMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Identity has already been verified by this request's operation guard.
    if (req.user) { next(); return; }
    const isDevelopment = process.env.NODE_ENV === "development";

    // Dev identity shortcut — never enabled outside development.
    if (isDevelopment) {
      const devUserId = req.headers["x-dev-user-id"];
      if (typeof devUserId === "string" && devUserId.trim()) {
        const user = await resolveDevUser(devUserId.trim());
        if (!user) {
          next(new ApiError(401, "Dev user not found"));
          return;
        }
        if (user.isBanned || user.deletionPendingAt) {
          next(new ApiError(403, "User is banned"));
          return;
        }
        req.user = user;
        next();
        return;
      }
    }

    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      next(new ApiError(401, "Missing or invalid authorization header"));
      return;
    }

    const idToken = authHeader.substring(7);

    // Reject forged/dev placeholder tokens outside the development bypass path.
    if (idToken === "__dev_owner__" || idToken === "__dev_admin__") {
      next(new ApiError(401, "Unauthorized"));
      return;
    }

    const admin = getFirebaseAdmin();
    const decoded = (await admin
      .auth()
      .verifyIdToken(idToken, true)) as DecodedIdToken;

    const user = await syncUserFromFirebase({
      firebaseUid: decoded.uid,
      fullName: decoded.name,
      email: decoded.email,
    });

    req.auth = decoded as unknown as Record<string, unknown>;
    req.user = user;
    if ((user as any).isBanned) {
      next(new ApiError(403, "User is banned"));
      return;
    }
    next();
  } catch {
    next(new ApiError(401, "Unauthorized"));
  }
};

export default authMiddleware;

export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  if (req.headers.authorization || req.headers["x-dev-user-id"]) return authMiddleware(req, res, next);
  next();
};
