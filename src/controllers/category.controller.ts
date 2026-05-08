import { Request, Response, NextFunction } from "express";
import ApiError from "../utils/ApiError";
import {
  createCategory,
  deactivateCategory,
  listActiveCategories,
  updateCategory,
} from "../services/category.service";

export const listCategoriesController = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json(await listActiveCategories());
  } catch (error) {
    next(error);
  }
};

export const createCategoryController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name : "";
    if (!name.trim()) {
      throw new ApiError(400, "Category name is required");
    }

    res.status(201).json(await createCategory(name));
  } catch (error) {
    next(error);
  }
};

export const deleteCategoryController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json(await deactivateCategory(String(req.params.id)));
  } catch (error) {
    next(error);
  }
};

export const updateCategoryController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name : "";
    if (!name.trim()) {
      throw new ApiError(400, "Category name is required");
    }

    res.json(await updateCategory(String(req.params.id), name));
  } catch (error) {
    next(error);
  }
};

export default {
  listCategoriesController,
  createCategoryController,
  updateCategoryController,
  deleteCategoryController,
};
