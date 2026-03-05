import { Types } from "mongoose";
import env from "../config/env";
import Business from "../models/Business";
import StaffProfile from "../models/StaffProfile";
import Service, { IService } from "../models/Service";
import ApiError from "../utils/ApiError";
import { delCachedKey, getCachedJson, setCachedJson } from "./cache.service";
import { recalculateBusinessAveragePrice } from "./business.service";

const normalizeCategoryName = (value?: string): string =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");

const resolveCategoryFields = async (input: {
  category?: string;
  categoryName?: string;
}): Promise<{
  category: string;
  categoryName: string;
}> => {
  const resolvedName =
    normalizeCategoryName(input.categoryName) ||
    normalizeCategoryName(input.category) ||
    "General";

  return {
    category: resolvedName,
    categoryName: resolvedName,
  };
};

export const createService = async ({
  ownerId,
  businessId,
  name,
  category,
  categoryName,
  sortOrder,
  duration,
  basePrice,
}: {
  ownerId: Types.ObjectId;
  businessId: string;
  name: string;
  category?: string;
  categoryName?: string;
  sortOrder?: number;
  duration: number;
  basePrice: number;
}): Promise<IService> => {
  const business = await Business.findById(businessId);
  if (!business) throw new ApiError(404, "Business not found");
  if (String(business.ownerId) !== String(ownerId))
    throw new ApiError(403, "Only business owner can add services");

  const resolvedCategory = await resolveCategoryFields({
    category,
    categoryName,
  });

  const service = await Service.create({
    businessId,
    name,
    ...resolvedCategory,
    sortOrder: sortOrder ?? 0,
    duration,
    basePrice,
  });
  await delCachedKey(`business:${businessId}:services`);
  if (business.type === "independent") {
    await StaffProfile.findOneAndUpdate({ businessId, staffId: String(ownerId) }, {
      $addToSet: { services: service._id },
      $setOnInsert: { businessId, staffId: String(ownerId), isActive: true, isBookableInCalendar: true },
    }, { upsert: true, runValidators: true });
  }
  await recalculateBusinessAveragePrice(businessId);
  return service;
};

export const listServicesByBusiness = async (
  businessId: string,
): Promise<IService[]> => {
  const cacheKey = `business:${businessId}:services`;
  const cached = await getCachedJson<IService[]>(cacheKey);
  if (cached) return cached;
  const services = await Service.find({ businessId, isActive: { $ne: false } }).sort({
    categoryName: 1,
    sortOrder: 1,
    createdAt: -1,
  });
  await setCachedJson(cacheKey, services, env.CACHE_TTL_SECONDS);
  return services;
};

export const getServiceById = async (serviceId: string): Promise<IService> => {
  const service = await Service.findById(serviceId);
  if (!service) throw new ApiError(404, "Service not found");
  return service;
};

export const updateService = async ({
  isActive,
  ownerId,
  serviceId,
  name,
  category,
  categoryName,
  sortOrder,
  duration,
  basePrice,
}: {
  ownerId: Types.ObjectId;
  serviceId: string;
  isActive?: boolean;
  name?: string;
  category?: string;
  categoryName?: string;
  sortOrder?: number;
  duration?: number;
  basePrice?: number;
}): Promise<IService> => {
  const service = await Service.findById(serviceId);
  if (!service) throw new ApiError(404, "Service not found");

  const business = await Business.findById(service.businessId);
  if (!business) throw new ApiError(404, "Business not found");
  if (String(business.ownerId) !== String(ownerId)) {
    throw new ApiError(403, "Only business owner can update services");
  }

  if (isActive !== undefined) service.isActive = isActive;
  if (name !== undefined) service.name = name;
  if (category !== undefined || categoryName !== undefined) {
    const resolvedCategory = await resolveCategoryFields({
      category,
      categoryName,
    });
    service.category = resolvedCategory.category;
    service.categoryName = resolvedCategory.categoryName;
  }
  if (sortOrder !== undefined) service.sortOrder = sortOrder;
  if (duration !== undefined) service.duration = duration;
  if (basePrice !== undefined) service.basePrice = basePrice;

  await service.save();
  await delCachedKey(`business:${String(service.businessId)}:services`);
  await recalculateBusinessAveragePrice(String(service.businessId));
  return service;
};

export const deleteService = async ({
  ownerId,
  serviceId,
}: {
  ownerId: Types.ObjectId;
  serviceId: string;
}): Promise<IService> => {
  const service = await Service.findById(serviceId);
  if (!service) throw new ApiError(404, "Service not found");

  const business = await Business.findById(service.businessId);
  if (!business) throw new ApiError(404, "Business not found");
  if (String(business.ownerId) !== String(ownerId)) {
    throw new ApiError(403, "Only business owner can delete services");
  }

  await service.deleteOne();
  await delCachedKey(`business:${String(service.businessId)}:services`);
  await recalculateBusinessAveragePrice(String(service.businessId));
  return service;
};
