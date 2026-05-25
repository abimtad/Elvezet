import { Router, raw } from "express";
import { clientIp, httpLimit } from '../middlewares/traffic.middleware';
import { policies, trafficLimiter } from '../services/traffic-limit.service';
import Booking from "../models/Booking";
import {
  applyVerifyEtResultToBooking,
} from "../services/bookingPaymentVerify.service";
import {
  verifyWebhookSignature,
  normalizeVerification,
} from "../services/verifyEt.service";

const router = Router();

/**
 * Verify.ET webhook. Register this URL in the Verify.ET dashboard:
 *   POST {APP_URL}/api/v1/webhooks/verify-et
 * Returns 204 after signature check (test pings included).
 */
router.post(
  "/verify-et",
  httpLimit(policies.webhookEdge, clientIp),
  raw({ type: "*/*", limit: "2mb" }),
  async (req, res) => {
    try {
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(typeof req.body === "string" ? req.body : "", "utf8");
      const timestamp =
        (req.header("x-webhook-timestamp") ||
          req.header("X-Webhook-Timestamp") ||
          "") as string;
      const signature =
        (req.header("x-webhook-signature") ||
          req.header("X-Webhook-Signature") ||
          req.header("x-signature") ||
          "") as string;
      const isTest = req.header("X-Webhook-Test") === "true";

      if (!verifyWebhookSignature(rawBody, timestamp, signature)) {
        const quota = await trafficLimiter.consume(policies.webhookInvalid, clientIp(req));
        if (!quota.allowed) { res.setHeader('Retry-After', quota.retryAfter); res.status(429).end(); return; }
        res.status(401).json({ success: false, message: "Invalid signature" });
        return;
      }

      const quota = await trafficLimiter.consume(policies.webhookValid, 'verify-et');
      if (!quota.allowed) { res.setHeader('Retry-After', quota.retryAfter); res.status(429).end(); return; }

      if (isTest) { res.status(204).end(); return; }

      const payload = JSON.parse(rawBody.toString("utf8")) as Record<
        string,
        unknown
      >;
      const eventId = String(payload.id || payload.eventId || "");
      const verification = normalizeVerification(payload);
      const requestId = String(
        verification.requestId ||
          payload.requestId ||
          (verification as { id?: string }).id ||
          "",
      );

      if (!requestId) { res.status(400).end(); return; }

      const booking = await Booking.findOne({ verifyEtRequestId: requestId });
      if (!booking) { res.status(503).end(); return; }

      // Simple event-id dedupe on booking doc
      const seen = Array.isArray(booking.notificationDispatched)
        ? booking.notificationDispatched
        : [];
      if (eventId && seen.includes(`verifyet:${eventId}`)) { res.status(204).end(); return; }

      await applyVerifyEtResultToBooking(String(booking._id), verification);

      if (eventId) {
        await Booking.updateOne(
          { _id: booking._id },
          { $addToSet: { notificationDispatched: `verifyet:${eventId}` } },
        );
      }
      res.status(204).end();
    } catch (error) {
      console.error("Verify.ET webhook error", error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: "Webhook error" });
      }
    }
  },
);

export default router;
