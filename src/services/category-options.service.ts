import { Types } from "mongoose";
import Business from "../models/Business";
import Category from "../models/Category";
import Product from "../models/Product";
import Service from "../models/Service";
import StaffProfile from "../models/StaffProfile";
import { IUser } from "../models/User";
import ApiError from "../utils/ApiError";
import { getDiscoverCategories } from "./discover.service";

export type CategoryKind = "business" | "service" | "product" | "specialty" | "discover";
export interface CategoryOptionsQuery {
  kind: CategoryKind;
  businessId?: string;
  q: string;
  limit: number;
}

const clean = (value: string): string => value.trim().replace(/\s+/g, " ");

// Used labels win over defaults. Search is literal (never a client-built regex).
export function rankCategoryOptions(used: string[], defaults: string[], query: string, limit: number) {
  const options = new Map<string, { value: string; label: string; source: "shop" | "catalog" }>();
  for (const [values, source] of [[used, "shop"], [defaults, "catalog"]] as const) {
    for (const raw of values) {
      const label = clean(raw);
      const key = label.toLowerCase();
      if (label && !options.has(key)) options.set(key, { value: label, label, source });
    }
  }
  const needle = clean(query).toLowerCase();
  const rank = (label: string) => label.toLowerCase() === needle ? 0 : label.toLowerCase().startsWith(needle) ? 1 : 2;
  const matched = [...options.values()].filter(option => option.label.toLowerCase().includes(needle));
  matched.sort((a, b) => rank(a.label) - rank(b.label) ||
    Number(a.source !== "shop") - Number(b.source !== "shop") || a.label.localeCompare(b.label));
  return { options: matched.slice(0, limit), hasMore: matched.length > limit };
}

function serviceDefaults(businessCategory: string): string[] {
  const name = businessCategory.toLowerCase();
  const values = ["General"];
  if (/barber|hair|salon/.test(name)) values.push("Haircuts", "Hair Styling", "Hair Care", "Hair Coloring");
  if (/barber/.test(name)) values.push("Beard Care", "Shaving");
  if (/nail/.test(name)) values.push("Manicure", "Pedicure", "Nail Art");
  if (/makeup|bridal/.test(name)) values.push("Makeup", "Bridal Makeup");
  if (/spa|massage/.test(name)) values.push("Massage", "Body Treatments");
  if (/beauty|skin|facial/.test(name)) values.push("Facials", "Skin Care", "Waxing");
  return values;
}

export async function listCategoryOptions(user: IUser, query: CategoryOptionsQuery) {
  const { kind, businessId, q, limit } = query;
  let used: string[] = [];
  let defaults: string[] = [];
  if (kind === "business") {
    defaults = (await Category.find({ isActive: true }).select("name").lean()).map(item => item.name);
  } else if (kind === "discover") {
    defaults = (await getDiscoverCategories()).filter(name => name.toLowerCase() !== "all");
  } else {
    if (!businessId || !/^[a-f\d]{24}$/i.test(businessId)) throw new ApiError(400, "A valid businessId is required");
    const business = await Business.findById(businessId).select("ownerId businessCategoryName businessCategoryId").lean();
    if (!business) throw new ApiError(404, "Business not found");
    const privileged = user.roles.some(role => role === "admin" || role === "moderator");
    const owner = String(business.ownerId) === String(user._id);
    const staff = !owner && !privileged && await StaffProfile.exists({
      businessId, staffId: { $in: [String(user._id), user.firebaseUid] }, isActive: true,
    });
    if (!owner && !privileged && !staff) throw new ApiError(403, "Business workspace access required");
    // Never mix another shop's labels or product labels into service suggestions.
    const scope = { businessId: new Types.ObjectId(businessId), isActive: { $ne: false } };
    let businessCategory = business.businessCategoryName || "";
    if (business.businessCategoryId) {
      const category = await Category.findById(business.businessCategoryId).select("name").lean();
      businessCategory = category?.name || businessCategory;
    }
    if (kind === "product") {
      used = await Product.distinct("category", scope);
      defaults = ["General"];
      if (/barber|hair|salon/i.test(businessCategory)) defaults.push("Hair Care", "Hair Styling", "Grooming Tools");
      if (/beauty|makeup|bridal/i.test(businessCategory)) defaults.push("Makeup", "Skin Care");
      if (/nail/i.test(businessCategory)) defaults.push("Nail Care", "Nail Polish");
      if (/spa|massage/i.test(businessCategory)) defaults.push("Body Care", "Massage Oils");
    } else {
      const services = await Service.find(scope).select("categoryName category").lean();
      used = services.map(service => clean(service.categoryName || "") || service.category || "General");
      if (kind === "specialty") used.push(...await StaffProfile.distinct("specialties", scope));
      defaults = serviceDefaults(businessCategory);
    }
  }
  return {
    kind, businessId: businessId || null, query: q,
    allowCustom: kind === "service" || kind === "product" || kind === "specialty",
    ...rankCategoryOptions(used, defaults, q, limit),
  };
}
