import { Request, Response } from "express";
import asyncHandler from "../utils/asyncHandler";
import {
  createStaffProfile,
  listStaffByBusiness,
} from "../services/staff.service";
import { sendSuccess } from "../utils/httpResponse";

export const createStaffController = asyncHandler(
  async (req: Request, res: Response) => {
    const staff = await createStaffProfile({
      ownerId: req.user!._id,
      ...req.body,
    });
    sendSuccess(res, 201, staff);
  },
);

export const listStaffController = asyncHandler(
  async (req: Request, res: Response) => {
    const { businessId } = req.params as { businessId: string };
    const staff = await listStaffByBusiness(businessId);
    sendSuccess(res, 200, staff);
  },
);
