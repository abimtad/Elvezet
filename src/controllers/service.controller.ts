import { Request, Response } from "express";
import asyncHandler from "../utils/asyncHandler";
import {
  createService,
  deleteService,
  getServiceById,
  listServicesByBusiness,
  updateService,
} from "../services/service.service";
import { sendSuccess } from "../utils/httpResponse";

export const createServiceController = asyncHandler(
  async (req: Request, res: Response) => {
    const { businessId } = req.params as { businessId: string };
    const service = await createService({
      ownerId: req.user!._id,
      businessId,
      ...req.body,
    });
    sendSuccess(res, 201, service);
  },
);

export const listServicesController = asyncHandler(
  async (req: Request, res: Response) => {
    const { businessId } = req.params as { businessId: string };
    const services = await listServicesByBusiness(businessId);
    sendSuccess(res, 200, services);
  },
);

export const getServiceController = asyncHandler(
  async (req: Request, res: Response) => {
    const { serviceId } = req.params as { serviceId: string };
    const service = await getServiceById(serviceId);
    sendSuccess(res, 200, service);
  },
);

export const updateServiceController = asyncHandler(
  async (req: Request, res: Response) => {
    const { serviceId } = req.params as { serviceId: string };
    const service = await updateService({
      ownerId: req.user!._id,
      serviceId,
      ...req.body,
    });
    sendSuccess(res, 200, service);
  },
);

export const deleteServiceController = asyncHandler(
  async (req: Request, res: Response) => {
    const { serviceId } = req.params as { serviceId: string };
    const service = await deleteService({
      ownerId: req.user!._id,
      serviceId,
    });
    sendSuccess(res, 200, service);
  },
);
