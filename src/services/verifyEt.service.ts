import crypto from "crypto";
import env from "../config/env";
import ApiError from "../utils/ApiError";

const BASE = () =>
  (env.VERIFY_ET_BASE_URL || "https://verify.et").replace(/\/$/, "");

export type VerifyEtSubmitResult = {
  requestId: string;
  processingStatus?: string;
  verification?: Record<string, unknown>;
  raw: unknown;
  completedInline: boolean;
};

export type VerifyEtWebhookPayload = {
  event?: string;
  id?: string;
  data?: Record<string, unknown>;
  verification?: Record<string, unknown>;
  requestId?: string;
};

const getApiKey = () => {
  const key = env.VERIFY_ET_API_KEY?.trim();
  if (!key) {
    throw new ApiError(503, "Verify.ET is not configured (VERIFY_ET_API_KEY)");
  }
  return key;
};

/** Submit a receipt image for verification. */
export const submitReceiptImage = async (input: {
  imageBuffer: Buffer;
  mimeType: string;
  fileName: string;
  idempotencyKey: string;
  settlementAccount?: string;
  bank?: string;
  waitMs?: number;
}): Promise<VerifyEtSubmitResult> => {
  const form = new FormData();
  const bytes = Uint8Array.from(input.imageBuffer);
  const blob = new Blob([bytes], {
    type: input.mimeType || "image/jpeg",
  });
  form.append("image", blob, input.fileName || "receipt.jpg");
  if (input.settlementAccount) {
    form.append("settlementAccount", input.settlementAccount);
  }
  if (input.bank) form.append("bank", input.bank);

  const waitMs = input.waitMs ?? 8000;
  const url = `${BASE()}/api/verify${waitMs > 0 ? `?waitMs=${waitMs}` : ""}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": getApiKey(),
      "Idempotency-Key": input.idempotencyKey.slice(0, 255),
    },
    body: form,
    signal: AbortSignal.timeout(45000),
  });

  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok && response.status !== 202) {
    const message =
      typeof body.message === "string"
        ? body.message
        : `Verify.ET error (${response.status})`;
    throw new ApiError(502, message);
  }

  const requestId =
    (typeof body.requestId === "string" && body.requestId) ||
    (typeof (body.data as { requestId?: string } | undefined)?.requestId ===
      "string" &&
      (body.data as { requestId: string }).requestId) ||
    "";

  if (!requestId) {
    throw new ApiError(502, "Verify.ET did not return a requestId");
  }

  const verification = normalizeVerification(body);

  const processingStatus =
    (verification?.processingStatus as string | undefined) ||
    (body.processingStatus as string | undefined);

  const completedInline =
    response.status === 200 &&
    (processingStatus === "completed" ||
      verification?.status === "success" ||
      verification?.success === true);

  return {
    requestId,
    processingStatus,
    verification,
    raw: body,
    completedInline,
  };
};

export const getVerificationStatus = async (
  requestId: string,
): Promise<Record<string, unknown>> => {
  const response = await fetch(`${BASE()}/api/verify/${requestId}`, {
    headers: { "x-api-key": getApiKey() },
    signal: AbortSignal.timeout(15000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new ApiError(
      502,
      typeof body.message === "string"
        ? body.message
        : "Could not fetch Verify.ET status",
    );
  }
  return normalizeVerification(body);
};

export const normalizeVerification = (body: Record<string, unknown>): Record<string, unknown> => {
  const data = Array.isArray(body.data) ? body.data[0] : body.data;
  const details = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const summary = body.verification && typeof body.verification === "object" ? body.verification as Record<string, unknown> : {};
  const { success: _envelopeSuccess, data: _data, verification: _summary, ...envelope } = body;
  return { ...envelope, ...summary, ...details };
};

/** HMAC-SHA256 over `${timestamp}.${rawBody}` per Verify.ET docs. */
export const verifyWebhookSignature = (
  rawBody: Buffer | string,
  timestamp: string | undefined,
  signature: string | undefined,
): boolean => {
  const secret = env.VERIFY_ET_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return false;
  }
  if (!timestamp || !signature) return false;
  const numeric = Number(timestamp);
  const epoch = Number.isFinite(numeric) ? numeric * 1000 : Date.parse(timestamp);
  if (!Number.isFinite(epoch) || Math.abs(Date.now() - epoch) > 300000) return false;
  const payload =
    typeof rawBody === "string"
      ? `${timestamp}.${rawBody}`
      : Buffer.concat([
          Buffer.from(`${timestamp}.`, "utf8"),
          rawBody,
        ]);
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  // Docs allow comma-separated signature parts (e.g. "sha256=abc,sha256=def").
  const parts = signature
    .split(",")
    .map((part) => part.trim().replace(/^sha256=/i, ""))
    .filter(Boolean);
  return parts.some((provided) => {
    try {
      const a = Buffer.from(expected, "hex");
      const b = Buffer.from(provided, "hex");
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return expected === provided;
    }
  });
};

export const isVerificationSuccessful = (
  verification: Record<string, unknown> | undefined,
): boolean => {
  if (!verification) return false;
  if (verification.verified === false || verification.success === false) return false;
  const status = String(
    verification.status ||
      verification.result ||
      verification.verificationStatus ||
      "",
  ).toLowerCase();
  if (["success", "successful", "verified"].includes(status)) {
    // Prefer explicit success flags when present
    if (verification.success === false) return false;
    return true;
  }
  if (verification.success === true) return true;
  const processing = String(verification.processingStatus || "").toLowerCase();
  if (processing === "completed" && verification.success !== false) {
    const nested = verification.verification as Record<string, unknown> | undefined;
    if (nested) return isVerificationSuccessful(nested);
  }
  return false;
};

export const isSettlementMatched = (
  verification: Record<string, unknown> | undefined,
): boolean | null => {
  if (!verification) return null;
  const match =
    (verification.settlementAccountMatch as Record<string, unknown> | undefined) ||
    (verification.settlementMatch as Record<string, unknown> | undefined);
  if (!match) return null;
  if (typeof match.matched === "boolean") return match.matched;
  return null;
};
