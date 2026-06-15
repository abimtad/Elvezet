import { Router } from "express";
import auth from "../middlewares/auth.middleware";
import asyncHandler from "../utils/asyncHandler";
import { listInbox, unreadCount, readNotification, readAllNotifications, resolveNotificationDestination } from "../services/notification-inbox.service";
const router = Router();
router.use(auth, (_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); });
router.get("/", asyncHandler(async (req, res) => {
  res.json(await listInbox(req.user!._id, req.query.cursor ? String(req.query.cursor) : undefined, Number(req.query.limit ?? 20)));
}));
router.get("/unread-count", asyncHandler(async (req, res) => { res.json({ unreadCount: await unreadCount(req.user!._id) }); }));
router.post("/read-all", asyncHandler(async (req, res) => { res.json(await readAllNotifications(req.user!._id)); }));
router.patch("/:id/read", asyncHandler(async (req, res) => { res.json(await readNotification(req.user!._id, String(req.params.id))); }));
router.get("/:id/destination", asyncHandler(async (req, res) => { res.json(await resolveNotificationDestination(req.user!._id, String(req.params.id))); }));
export default router;
