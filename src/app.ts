import { configureProxy } from "./config/proxy";
import compression from "compression";
import cors from "cors";
import { hasActiveShopMembership } from "./services/booking-access.service";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { clientIp, httpLimit } from './middlewares/traffic.middleware';
import { policies, trafficLimitStore } from './services/traffic-limit.service';
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import { sendSuccess } from "./utils/httpResponse";
import authMiddleware from "./middlewares/auth.middleware";
import asyncHandler from "./utils/asyncHandler";
import Business from "./models/Business";
import ApiError from "./utils/ApiError";
import Booking from "./models/Booking";
import { Types } from "mongoose";
import verifyEtRoutes from "./routes/verifyEt.routes";

const app = express();
configureProxy(app);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-dev-user-id",
      "x-business-id",
      "Accept",
    ],
  }),
);
app.use(compression());
app.use((req, res, next) => /^\/api(?:\/v1)?\/webhooks\/verify-et\/?$/.test(req.path)
  ? next() : httpLimit(policies.edge, clientIp)(req, res, next));
// Verify.ET webhook needs the raw body for HMAC — mount before JSON parser.
app.use("/api/v1/webhooks", verifyEtRoutes);
app.use("/api/webhooks", verifyEtRoutes);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));

// Serve uploaded files statically
app.use("/uploads/booking-screenshots", authMiddleware, asyncHandler(async (req, res, next) => {
  const bookingId = req.path.split("/")[1];
  if (!Types.ObjectId.isValid(bookingId)) throw new ApiError(404, "Receipt not found");
  const booking = await Booking.findById(bookingId);
  const business = booking && await Business.findById(booking.businessId).select("ownerId");
  const privileged = req.user!.roles.some(role => role === "admin" || role === "moderator");
  const userKey = String(req.user!._id);
  const isCustomer =
    [userKey, req.user!.firebaseUid].includes(String(booking?.userId || ""));
  const isOwner = String(business?.ownerId) === userKey;
  let isShopStaff = false;
  if (booking && !privileged && !isCustomer && !isOwner) {
    isShopStaff = await hasActiveShopMembership(booking.businessId, req.user!);
  }
  if (!booking || (!privileged && !isCustomer && !isOwner && !isShopStaff)) {
    throw new ApiError(403, "Private payment document");
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.locals.privateUploadScope = `booking-screenshots/${bookingId}`;
  next();
}));
app.use("/uploads/id-cards", authMiddleware, asyncHandler(async (req, res, next) => {
  const isModerator = req.user!.roles.some(role => role === "admin" || role === "moderator");
  if (!isModerator && !await Business.exists({ ownerId: req.user!._id, idCardUrl: `/uploads/id-cards${req.path}` })) {
    throw new ApiError(403, "Private verification document");
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.locals.privateUploadScope = "id-cards";
  next();
}));
app.use("/uploads", (req, res, next) => {
  let normalized: string;
  try { normalized = path.posix.normalize(decodeURIComponent(req.path).replace(/\\/g, "/")).replace(/^\/+/, "").toLowerCase(); }
  catch { return next(new ApiError(400, "Invalid upload path")); }
  const directory = normalized.split("/")[0];
  if (["id-cards", "booking-screenshots"].includes(directory)) {
    const scope = res.locals.privateUploadScope as string | undefined;
    if (!scope || !normalized.startsWith(`${scope.toLowerCase()}/`)) return next(new ApiError(403, "Private document"));
  }
  next();
}, express.static(path.join(__dirname, "..", "uploads")));

app.get("/health", (_req, res) => {
  sendSuccess(res, 200, { status: "ok", rateLimitStore: trafficLimitStore() });
});

app.use("/api/v1", routes);
app.use("/api", routes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
