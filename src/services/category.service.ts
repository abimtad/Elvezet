import Category from "../models/Category";
import Business from "../models/Business";
import ApiError from "../utils/ApiError";

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeCategoryName = (name: string): string =>
  name
    .trim()
    .replace(/\s+/g, " ");

export const listActiveCategories = async (): Promise<
  Array<{ _id: unknown; name: string; isActive: boolean }>
> => {
  return Category.find({ isActive: true }).sort({ name: 1 }).lean();
};

export const createCategory = async (name: string): Promise<{
  _id: unknown;
  name: string;
  isActive: boolean;
}> => {
  const normalizedName = normalizeCategoryName(name);
  if (!normalizedName) {
    throw new ApiError(400, "Category name is required");
  }

  const existing = await Category.findOne({
    name: new RegExp(`^${escapeRegExp(normalizedName)}$`, "i"),
  });

  if (existing) {
    if (existing.isActive) {
      throw new ApiError(409, "Category already exists");
    }

    existing.name = normalizedName;
    existing.isActive = true;
    const saved = await existing.save();
    return saved.toObject() as {
      _id: unknown;
      name: string;
      isActive: boolean;
    };
  }

  const created = await Category.create({
    name: normalizedName,
    isActive: true,
  });
  return created.toObject() as {
    _id: unknown;
    name: string;
    isActive: boolean;
  };
};

const businessUsageQuery = (categoryId: string, categoryName: string) => ({
  $or: [
    { businessCategoryId: categoryId },
    { businessCategoryName: new RegExp(`^${escapeRegExp(categoryName)}$`, "i") },
  ],
});

export const updateCategory = async (
  categoryId: string,
  name: string,
): Promise<{
  _id: unknown;
  name: string;
  isActive: boolean;
}> => {
  const category = await Category.findById(categoryId);
  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  const normalizedName = normalizeCategoryName(name);
  if (!normalizedName) {
    throw new ApiError(400, "Category name is required");
  }

  const duplicate = await Category.findOne({
    _id: { $ne: category._id },
    name: new RegExp(`^${escapeRegExp(normalizedName)}$`, "i"),
  });
  if (duplicate) {
    throw new ApiError(409, "Category already exists");
  }

  const previousName = category.name;
  category.name = normalizedName;
  const saved = await category.save();

  await Business.updateMany(
    businessUsageQuery(String(category._id), previousName),
    {
      $set: {
        businessCategoryId: category._id,
        businessCategoryName: normalizedName,
      },
    },
  );

  return saved.toObject() as {
    _id: unknown;
    name: string;
    isActive: boolean;
  };
};

export const deactivateCategory = async (categoryId: string): Promise<{
  _id: unknown;
  name: string;
  isActive: boolean;
}> => {
  const category = await Category.findById(categoryId);
  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  const businessCount = await Business.countDocuments(
    businessUsageQuery(String(category._id), category.name),
  );

  if (businessCount > 0) {
    throw new ApiError(
      409,
      `Business category is used by ${businessCount} business${businessCount === 1 ? "" : "es"}. Move those businesses before deleting.`,
    );
  }

  category.isActive = false;
  const saved = await category.save();
  return saved.toObject() as {
    _id: unknown;
    name: string;
    isActive: boolean;
  };
};

export default {
  listActiveCategories,
  createCategory,
  updateCategory,
  deactivateCategory,
};
