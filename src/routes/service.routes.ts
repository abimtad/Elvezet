import { Router } from "express";
import {
  createServiceController,
  deleteServiceController,
  getServiceController,
  listServicesController,
  updateServiceController,
} from "../controllers/service.controller";
import authMiddleware from "../middlewares/auth.middleware";
import requireRole from "../middlewares/role.middleware";
import validate from "../middlewares/validate.middleware";
import {
  createServiceSchema,
  updateServiceSchema,
} from "../validators/service.validator";

const router = Router();

router.post(
  "/:businessId",
  authMiddleware,
  requireRole("owner"),
  validate(createServiceSchema),
  createServiceController,
);

router.get("/item/:serviceId", getServiceController);
router.get("/:businessId", listServicesController);

router.patch(
  "/:serviceId",
  authMiddleware,
  requireRole("owner"),
  validate(updateServiceSchema),
  updateServiceController,
);

router.delete(
  "/:serviceId",
  authMiddleware,
  requireRole("owner"),
  deleteServiceController,
);

export default router;
