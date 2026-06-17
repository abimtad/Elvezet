import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware";
import requireAdmin from "../middlewares/admin.middleware";
import AdminController from "../controllers/admin.controller";
import requireModerator from "../middlewares/moderator.middleware";

const router = Router();

router.post(
  "/register-tenant",
  authMiddleware,
  requireAdmin,
  AdminController.registerTenant,
);

router.get(
  "/global-stats",
  authMiddleware,
  requireModerator,
  AdminController.getGlobalStats,
);

router.get(
  "/tenants",
  authMiddleware,
  requireModerator,
  AdminController.getTenants,
);

router.patch(
  "/tenants/:id/category",
  authMiddleware,
  requireAdmin,
  AdminController.updateTenantCategory,
);

router.patch(
  "/tenants/:id/products-enabled",
  authMiddleware,
  requireAdmin,
  AdminController.setTenantProductsEnabled,
);

router.get(
  "/verification-queue",
  authMiddleware,
  requireModerator,
  AdminController.getVerificationQueue,
);

router.patch(
  "/tenants/:id/verify",
  authMiddleware,
  requireAdmin,
  AdminController.verifyTenant,
);

router.patch(
  "/verify-barber/:id",
  authMiddleware,
  requireAdmin,
  AdminController.verifyTenant,
);

router.get(
  "/users",
  authMiddleware,
  requireModerator,
  AdminController.listUsers,
);

router.patch(
  "/users/:id/ban",
  authMiddleware,
  requireAdmin,
  AdminController.toggleBan,
);

export default router;
