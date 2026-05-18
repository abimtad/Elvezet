import { Router } from "express";
import {
  createBusinessController,
  getBusinessController,
  listBusinessesController,
  quoteBusinessController,
  deleteBusinessGalleryImageController,
  uploadBusinessIdCardController,
  uploadBusinessCoverController,
  uploadBusinessGalleryController,
  uploadBusinessLogoController,
  updateBusinessController,
} from "../controllers/business.controller";
import { listServicesController } from "../controllers/service.controller";
import { listStaffController } from "../controllers/staff.controller";
import { listReviewsController } from "../controllers/review.controller";
import { listBusinessProductReviewsController } from "../controllers/product.controller";
import { parseBusinessGalleryUpload, parseBusinessSingleImageUpload } from "../middlewares/businessMedia.middleware";
import authMiddleware, { optionalAuth } from "../middlewares/auth.middleware";
import requireBusinessOwner from "../middlewares/businessOwner.middleware";
import requireModerator from "../middlewares/moderator.middleware";
import requireRole from "../middlewares/role.middleware";
import validate from "../middlewares/validate.middleware";
import {
  createBusinessSchema,
  listBusinessesQuerySchema,
  quoteBusinessSchema,
  updateBusinessSchema,
} from "../validators/business.validator";

const router = Router();

router.get(
  "/",
  validate(listBusinessesQuerySchema, "query"),
  listBusinessesController,
);
router.post(
  "/",
  authMiddleware,
  requireRole("owner"),
  validate(createBusinessSchema),
  createBusinessController,
);
router.get("/:businessId", optionalAuth, getBusinessController);
router.post(
  "/:id/quote",
  validate(quoteBusinessSchema),
  quoteBusinessController,
);
router.get("/:businessId/services", listServicesController);
router.get("/:businessId/staff", listStaffController);
router.get("/:businessId/reviews", optionalAuth, listReviewsController);
router.get(
  "/:businessId/product-reviews",
  optionalAuth,
  listBusinessProductReviewsController,
);

router.post(
  "/:id/logo",
  authMiddleware,
  requireBusinessOwner,
  parseBusinessSingleImageUpload("image"),
  uploadBusinessLogoController,
);

router.post(
  "/:id/cover",
  authMiddleware,
  requireBusinessOwner,
  parseBusinessSingleImageUpload("image"),
  uploadBusinessCoverController,
);

router.post(
  "/:id/gallery",
  authMiddleware,
  requireBusinessOwner,
  parseBusinessGalleryUpload,
  uploadBusinessGalleryController,
);

router.delete(
  "/:id/gallery/:imageIndex",
  authMiddleware,
  requireBusinessOwner,
  deleteBusinessGalleryImageController,
);

router.post(
  "/:id/id-card",
  authMiddleware,
  requireModerator,
  parseBusinessSingleImageUpload("image"),
  uploadBusinessIdCardController,
);

router.patch(
  "/:id",
  authMiddleware,
  requireBusinessOwner,
  validate(updateBusinessSchema),
  updateBusinessController,
);

export default router;
