import { Request, Response } from "express";
import asyncHandler from "../utils/asyncHandler";
import {
  createReview,
  deleteReview,
  getReviewById,
  listReviewsByBusiness,
  updateReview,
} from "../services/review.service";
import { sendSuccess } from "../utils/httpResponse";

export const createReviewController = asyncHandler(
  async (req: Request, res: Response) => {
    const review = await createReview({ ...req.body, userId: req.user!._id });
    sendSuccess(res, 201, review);
  },
);

export const listReviewsController = asyncHandler(
  async (req: Request, res: Response) => {
    const { businessId } = req.params as { businessId: string };
    const sort = req.query.sort as "latest" | "best" | "worst" | undefined;
    const reviews = await listReviewsByBusiness(businessId, sort, req.user?._id);
    sendSuccess(res, 200, reviews);
  },
);

export const getReviewController = asyncHandler(
  async (req: Request, res: Response) => {
    const { reviewId } = req.params as { reviewId: string };
    const review = await getReviewById(reviewId, req.user?._id);
    sendSuccess(res, 200, review);
  },
);

export const updateReviewController = asyncHandler(
  async (req: Request, res: Response) => {
    const { reviewId } = req.params as { reviewId: string };
    const review = await updateReview({
      reviewId,
      requester: {
        _id: req.user!._id,
        roles: req.user!.roles,
      },
      ...req.body,
    });
    sendSuccess(res, 200, review);
  },
);

export const deleteReviewController = asyncHandler(
  async (req: Request, res: Response) => {
    const { reviewId } = req.params as { reviewId: string };
    const review = await deleteReview({
      reviewId,
      requester: {
        _id: req.user!._id,
        roles: req.user!.roles,
      },
    });
    sendSuccess(res, 200, review);
  },
);
