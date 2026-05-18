import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware";
import requireAdmin from "../middlewares/admin.middleware";
import requireModerator from "../middlewares/moderator.middleware";
import validate from "../middlewares/validate.middleware";
import CategoryController from "../controllers/category.controller";
import {
  createCategorySchema,
  updateCategorySchema,
} from "../validators/category.validator";

const router = Router();

router.get("/categories", CategoryController.listCategoriesController);

router.post(
  "/admin/categories",
  authMiddleware,
  requireModerator,
  validate(createCategorySchema),
  CategoryController.createCategoryController,
);

router.patch(
  "/admin/categories/:id",
  authMiddleware,
  requireModerator,
  validate(updateCategorySchema),
  CategoryController.updateCategoryController,
);

router.delete(
  "/admin/categories/:id",
  authMiddleware,
  requireAdmin,
  CategoryController.deleteCategoryController,
);

export default router;
