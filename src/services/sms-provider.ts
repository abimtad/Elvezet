import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env.sms.local"), quiet: true });

export interface SmsProvider {
  send(input: { to: string; body: string; idempotencyKey: string }): Promise<{ providerMessageId: string; simulated?: boolean; segments?: number; accepted?: boolean }>;
  status?(id: string): Promise<"accepted" | "sent" | "delivered">;
}
export class SmsProviderError extends Error {
  constructor(public reason: string, public kind: "permanent" | "retryable" | "ambiguous") { super(reason); }
}
export const smsMode = () => process.env.SMS_DRY_RUN === "true" ? "simulation"
  : process.env.SMS_ENABLED === "true" && process.env.SMS_PROVIDER === "smsethiopia" && !!process.env.SMS_API_KEY ? "live" : "disabled";

const gsm = new Set(Array.from("@\u00a3$\u00a5\u00e8\u00e9\u00f9\u00ec\u00f2\u00c7\n\u00d8\u00f8\r\u00c5\u00e5\u0394_\u03a6\u0393\u039b\u03a9\u03a0\u03a8\u03a3\u0398\u039e\u00c6\u00e6\u00df\u00c9 !\"#\u00a4%&'()*+,-./0123456789:;<=>?\u00a1ABCDEFGHIJKLMNOPQRSTUVWXYZ\u00c4\u00d6\u00d1\u00dc\u00a7\u00bfabcdefghijklmnopqrstuvwxyz\u00e4\u00f6\u00f1\u00fc\u00e0"));
const extended = new Set(Array.from("\f^{}\\[~]|\u20ac"));
export function smsSegments(body: string) {
  let length = 0;
  for (const char of body) {
    if (gsm.has(char)) length++;
    else if (extended.has(char)) length += 2;
    else return body.length <= 70 ? 1 : Math.ceil(body.length / 67);
  }
  return length <= 160 ? 1 : Math.ceil(length / 153);
}

type Http = typeof fetch;
export function createSmsEthiopiaProvider(key: () => string | undefined, http: Http = fetch): SmsProvider {
  const request = async (url: string, init?: RequestInit) => {
    const secret = key();
    if (!secret) throw new SmsProviderError("sms_api_key_missing", "permanent");
    let response: Response;
    try {
      response = await http(url, { ...init, redirect: "error", signal: AbortSignal.timeout(10000), headers: { KEY: secret, "Content-Type": "application/json" } });
    } catch { throw new SmsProviderError("provider_request_uncertain", "ambiguous"); }
    if (response.status === 429) throw new SmsProviderError("provider_rate_limit", "retryable");
    if ([401, 403].includes(response.status)) throw new SmsProviderError("provider_authentication", "permanent");
    if (response.status >= 500) throw new SmsProviderError("provider_request_uncertain", "ambiguous");
    let body: any;
    try { body = await response.json(); }
    catch { throw new SmsProviderError("provider_response_uncertain", "ambiguous"); }
    if (!response.ok || body.sent === false || body.error_message) {
      const code = String(body.error_message || "").match(/\b100(?:00|02|05|06|07)\b/)?.[0];
      throw new SmsProviderError(code ? `smsethiopia_${code}` : "provider_rejected", "permanent");
    }
    return body;
  };
  return {
    async send({ to, body }) {
      const phone = normalizeSmsPhone(to);
      if (!phone || !/^\+2519\d{8}$/.test(phone)) throw new SmsProviderError("provider_invalid_recipient", "permanent");
      const result = await request("https://smsethiopia.com/api/v2/sms/send", { method: "POST", body: JSON.stringify({ msisdn: phone.slice(1), text: body }) });
      if (result.sent !== true || !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(result.id || "") || !Number.isInteger(result.segments) || result.segments < 1 || result.status !== "ACCEPTED") {
        throw new SmsProviderError("provider_response_uncertain", "ambiguous");
      }
      return { providerMessageId: result.id, segments: result.segments, accepted: true };
    },
    async status(id) {
      if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) throw new SmsProviderError("provider_invalid_message_id", "permanent");
      const result = await request(`https://smsethiopia.com/api/v2/sms/${id}`);
      if (result.id !== id || !["ACCEPTED", "SENT", "DELIVERED"].includes(result.status)) throw new SmsProviderError("provider_invalid_status", "permanent");
      return result.status.toLowerCase();
    },
  };
}

export const normalizeSmsPhone = (input?: string): string | null => {
  let phone = (input || "").replace(/[\s()-]/g, "");
  if (/^0[79]\d{8}$/.test(phone)) phone = `+251${phone.slice(1)}`;
  if (/^251[79]\d{8}$/.test(phone)) phone = `+${phone}`;
  if (phone.startsWith("00251")) phone = `+${phone.slice(2)}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
};

const liveProvider = createSmsEthiopiaProvider(() => process.env.SMS_API_KEY);
export const smsProvider: SmsProvider = {
  async send(input) {
    if (smsMode() === "simulation") return { providerMessageId: `dry-run-${input.idempotencyKey}`, simulated: true, segments: smsSegments(input.body) };
    if (smsMode() !== "live") throw new SmsProviderError("live_sms_disabled", "permanent");
    return liveProvider.send(input);
  },
  async status(id) {
    if (smsMode() !== "live") throw new SmsProviderError("live_sms_disabled", "permanent");
    return liveProvider.status!(id);
  },
};
