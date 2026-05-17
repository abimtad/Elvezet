import { Request, Response } from "express";
import asyncHandler from "../utils/asyncHandler";
import { sendSuccess } from "../utils/httpResponse";
import {
  deleteProductReview,
  getMarketplaceProductById,
  listBusinessProductReviews,
  listMarketplaceProducts,
  listProductReviews,
  upsertProductReview,
} from "../services/product.service";

export const listMarketplaceProductsController = asyncHandler(
  async (req: Request, res: Response) => {
    const products = await listMarketplaceProducts({
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      category: req.query.category ? String(req.query.category) : undefined,
      businessId: req.query.businessId
        ? String(req.query.businessId)
        : undefined,
    });
    sendSuccess(res, 200, products);
  },
);

export const getMarketplaceProductController = asyncHandler(
  async (req: Request, res: Response) => {
    const product = await getMarketplaceProductById(
      String(req.params.productId),
    );
    sendSuccess(res, 200, product);
  },
);

export const listProductReviewsController = asyncHandler(
  async (req: Request, res: Response) => {
    const reviews = await listProductReviews(
      String(req.params.productId),
      req.query.sort as "latest" | "best" | "worst" | undefined,
      req.user?._id,
    );
    sendSuccess(res, 200, reviews);
  },
);

export const upsertProductReviewController = asyncHandler(
  async (req: Request, res: Response) => {
    const review = await upsertProductReview({
      userId: req.user!._id,
      productId: String(req.params.productId),
      rating: Number(req.body.rating),
      comment: req.body.comment,
    });
    sendSuccess(res, 201, review);
  },
);

export const deleteProductReviewController = asyncHandler(
  async (req: Request, res: Response) => {
    await deleteProductReview({
      reviewId: String(req.params.reviewId),
      requesterId: req.user!._id,
      roles: req.user!.roles || [],
    });
    sendSuccess(res, 200, { deleted: true });
  },
);

export const listBusinessProductReviewsController = asyncHandler(
  async (req: Request, res: Response) => {
    const reviews = await listBusinessProductReviews(
      String(req.params.businessId),
      req.query.sort as "latest" | "best" | "worst" | undefined,
      req.user?._id,
    );
    sendSuccess(res, 200, reviews);
  },
);
