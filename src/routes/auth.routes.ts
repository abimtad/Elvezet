import { signInWithGoogleToken } from '../services/auth.service';
import customerAuthRoutes from './customer-auth.routes';
import { Router } from "express";
import { clientIp, httpLimit } from '../middlewares/traffic.middleware';
import { policies } from '../services/traffic-limit.service';
import { businessWorkspaces } from "../services/business-workspaces.service";
import asyncHandler from "../utils/asyncHandler";
import authMiddleware from "../middlewares/auth.middleware";
import validate from "../middlewares/validate.middleware";
import {
  changeCurrentUserPasswordController,
  customerCheckoutController,
  getCurrentUser,
  signInController,
  signUpController,
  updateCurrentUserProfileController,
  devSeedInfoController,
} from "../controllers/auth.controller";
import {
  changePasswordSchema,
  customerCheckoutSchema,
  signInSchema,
  signUpSchema,
  updateProfileSchema,
} from "../validators/auth.validator";
import {
  parseProfilePictureUpload,
  uploadProfilePictureIfExists,
} from "../middlewares/profilePicture.middleware";

const router = Router();
router.use((req, res, next) => /^\/(signin|signup|google|customer\/(register|signin|password))\/?$/.test(req.path)
  ? httpLimit(policies.authIp, clientIp)(req, res, next) : next());
router.use('/customer', customerAuthRoutes);
router.get("/workspaces", authMiddleware, asyncHandler(async (req, res) => {
  res.json({ data: { user: { id: String(req.user!._id), fullName: req.user!.fullName, email: req.user!.email }, workspaces: await businessWorkspaces(req.user!) } });
}));

router.post("/signup", validate(signUpSchema), signUpController);
router.post("/signin", validate(signInSchema), signInController);
router.post("/google", validate(signInSchema), asyncHandler(async (req, res) => {
  const user = await signInWithGoogleToken(req.body.idToken);
  res.json({status: "success", data: {user}});
}));
router.post(
  "/customer-checkout",
  (_req, res) => { res.status(410).json({ message: "Update the customer app and sign in with phone number and password." }); },
);
router.get("/dev-seed-info", devSeedInfoController);
router.get("/me", authMiddleware, getCurrentUser);
router.patch(
  "/me/update",
  authMiddleware,
  parseProfilePictureUpload,
  validate(updateProfileSchema),
  uploadProfilePictureIfExists,
  updateCurrentUserProfileController,
);
router.patch(
  "/change-password",
  authMiddleware,
  validate(changePasswordSchema),
  changeCurrentUserPasswordController,
);

export default router;
