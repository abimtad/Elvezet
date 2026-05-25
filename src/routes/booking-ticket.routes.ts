import { Router } from "express";
import { httpLimit } from '../middlewares/traffic.middleware';
import { policies } from '../services/traffic-limit.service';
import auth from "../middlewares/auth.middleware";
import asyncHandler from "../utils/asyncHandler";
import { sendSuccess } from "../utils/httpResponse";
import { getBookingTicket, verifyBookingTicket } from "../services/booking-ticket.service";

const router = Router();
const limit = httpLimit(policies.ticket);
router.post("/tickets/verify", auth, limit, asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");
  sendSuccess(res, 200, await verifyBookingTicket(req.body?.code, req.user!, req.get("x-business-id")));
}));
router.get("/:id/ticket", auth, limit, asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");
  sendSuccess(res, 200, await getBookingTicket(String(req.params.id), req.user!));
}));
export default router;
