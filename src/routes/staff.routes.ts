import { Router } from "express";
import {
  createStaffController,
  listStaffController,
} from "../controllers/staff.controller";
import authMiddleware from "../middlewares/auth.middleware";
import requireRole from "../middlewares/role.middleware";
import validate from "../middlewares/validate.middleware";
import { createStaffSchema } from "../validators/staff.validator";

const router = Router();

router.post(
  "/",
  authMiddleware,
  requireRole("owner"),
  validate(createStaffSchema),
  createStaffController,
);

export default router;
