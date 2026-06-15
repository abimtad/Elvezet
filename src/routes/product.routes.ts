import { Router } from "express";
import authMiddleware, { optionalAuth } from "../middlewares/auth.middleware";
import validate from "../middlewares/validate.middleware";
import {
  deleteProductReviewController,
  getMarketplaceProductController,
  listMarketplaceProductsController,
  listProductReviewsController,
  upsertProductReviewController,
} from "../controllers/product.controller";
import {
  createProductReviewSchema,
  listMarketplaceQuerySchema,
  listProductReviewsQuerySchema,
  productIdParamSchema,
} from "../validators/product.validator";

const router = Router();

router.get(
  "/",
  validate(listMarketplaceQuerySchema, "query"),
  listMarketplaceProductsController,
);

router.get(
  "/:productId",
  validate(productIdParamSchema, "params"),
  getMarketplaceProductController,
);

router.get(
  "/:productId/reviews",
  optionalAuth,
  validate(productIdParamSchema, "params"),
  validate(listProductReviewsQuerySchema, "query"),
  listProductReviewsController,
);

router.post(
  "/:productId/reviews",
  authMiddleware,
  validate(productIdParamSchema, "params"),
  validate(createProductReviewSchema),
  upsertProductReviewController,
);

router.delete(
  "/reviews/:reviewId",
  authMiddleware,
  deleteProductReviewController,
);

export default router;
