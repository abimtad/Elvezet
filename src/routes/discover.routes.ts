import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware";
import requireAdmin from "../middlewares/admin.middleware";
import requireModerator from "../middlewares/moderator.middleware";
import DiscoverCategory from "../models/DiscoverCategory";
import { createDiscoverCategory, deleteDiscoverCategory } from "../services/discover.service";
import {
  createDiscoverVideoController,
  deleteDiscoverVideoController,
  getDiscoverVideoController,
  listAdminDiscoverVideosController,
  listPublicDiscoverVideosController,
  updateDiscoverVideoController,
} from "../controllers/discover.controller";

const router = Router();

router.get("/admin/discover/categories", authMiddleware, requireModerator, async (_req, res, next) => {
  try { res.json(await DiscoverCategory.find().sort({ createdAt: 1 }).lean()); }
  catch (error) { next(error); }
});
router.post("/admin/discover/categories", authMiddleware, requireAdmin, async (req, res, next) => {
  try { res.status(201).json(await createDiscoverCategory(req.body.name)); }
  catch (error) { next(error); }
});
router.delete("/admin/discover/categories/:id", authMiddleware, requireAdmin, async (req, res, next) => {
  try { res.json(await deleteDiscoverCategory(String(req.params.id))); }
  catch (error) { next(error); }
});

// Public — BarberOS Discover tab
router.get("/discover/videos", listPublicDiscoverVideosController);
router.get("/discover/videos/:id", getDiscoverVideoController);

// Super admin / moderator CRUD
router.get(
  "/admin/discover/videos",
  authMiddleware,
  requireModerator,
  listAdminDiscoverVideosController,
);

router.post(
  "/admin/discover/videos",
  authMiddleware,
  requireAdmin,
  createDiscoverVideoController,
);

router.patch(
  "/admin/discover/videos/:id",
  authMiddleware,
  requireAdmin,
  updateDiscoverVideoController,
);

router.delete(
  "/admin/discover/videos/:id",
  authMiddleware,
  requireAdmin,
  deleteDiscoverVideoController,
);

export default router;
