import { Router } from "express";
import auth from "../middlewares/auth.middleware";
import admin from "../middlewares/admin.middleware";
import asyncHandler from "../utils/asyncHandler";
import Notification from "../models/Notification";
const router = Router();
router.use(auth, admin);
router.get("/", asyncHandler(async (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ counts: await Notification.aggregate([{ $group: { _id: "$deliveryStatus", count: { $sum: 1 } } }]),
    failures: await Notification.find({ deliveryStatus: "failed" }).sort({ updatedAt: -1 }).limit(100)
      .select("_id type attempts lastError updatedAt").lean() });
}));
export default router;
