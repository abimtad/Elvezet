import axios from "axios";
import {
  DEFAULT_DEV_OWNER_FIREBASE_UID,
  getDevUserId,
  getDevShopId,
  setDevSession,
} from "./devAuth";

export type DevSeedInfo = {
  ownerId?: string;
  firebaseUid?: string;
  shopId?: string | null;
  email?: string;
  adminId?: string | null;
  adminFirebaseUid?: string | null;
  _warning?: string;
  error?: string;
};

export async function fetchDevSeedInfo(): Promise<DevSeedInfo> {
  const response = await axios.get<DevSeedInfo>("/api/dev-seed-info");
  const data = response.data;

  if (data.error) {
    throw new Error(data.error);
  }

  return data;
}

export function resolveDevUserId(payload: DevSeedInfo): string {
  const id = payload.ownerId || payload.firebaseUid;
  if (id) return id;
  return DEFAULT_DEV_OWNER_FIREBASE_UID;
}

/** Refresh dev owner/shop ids from API or public/dev-seed.json after re-seed. */
export async function syncDevSessionFromSeed(): Promise<DevSeedInfo | null> {
  if (typeof window === "undefined" || !getDevUserId() || !getDevShopId()) {
    return null;
  }

  try {
    const payload = await fetchDevSeedInfo();
    const devUserId = resolveDevUserId(payload);
    setDevSession(devUserId, payload.shopId || undefined);
    return payload;
  } catch {
    return null;
  }
}

export function formatDevLoginError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const apiMessage =
      (err.response?.data as { error?: string })?.error ||
      (err.response?.data as { message?: string })?.message;
    if (apiMessage) return apiMessage;
    if (!err.response) {
      return "Could not load dev login info. Ensure the Next.js app is running and try again.";
    }
    return err.message;
  }
  return err instanceof Error ? err.message : "Dev login failed";
}
