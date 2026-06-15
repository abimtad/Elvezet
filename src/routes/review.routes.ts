import { Router } from "express";
import {
  createReviewController,
  deleteReviewController,
  getReviewController,
  listReviewsController,
  updateReviewController,
} from "../controllers/review.controller";
import authMiddleware, { optionalAuth } from "../middlewares/auth.middleware";
import validate from "../middlewares/validate.middleware";
import {
  createReviewSchema,
  listReviewsQuerySchema,
  updateReviewSchema,
} from "../validators/review.validator";

const router = Router();

router.post(
  "/",
  authMiddleware,
  validate(createReviewSchema),
  createReviewController,
);

router.get(
  "/business/:businessId",
  optionalAuth,
  validate(listReviewsQuerySchema, "query"),
  listReviewsController,
);
router.get("/:reviewId", optionalAuth, getReviewController);

router.patch(
  "/:reviewId",
  authMiddleware,
  validate(updateReviewSchema),
  updateReviewController,
);

router.delete("/:reviewId", authMiddleware, deleteReviewController);

export default router;
