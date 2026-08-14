export const DEV_AUTH_TOKEN = "__dev_owner__";
export const DEV_USER_ID_KEY = "barberos_dev_user_id";
export const DEV_SHOP_ID_KEY = "barberos_dev_shop_id";

/** Firebase UID from seed — works with x-dev-user-id when Mongo _id is unknown */
export const DEFAULT_DEV_OWNER_FIREBASE_UID =
  process.env.NEXT_PUBLIC_DEV_OWNER_FIREBASE_UID || "mustdash-owner-dev";
export const DEFAULT_DEV_ADMIN_FIREBASE_UID =
  process.env.NEXT_PUBLIC_DEV_ADMIN_FIREBASE_UID || "mustdash-admin-dev";

export const getDevUserId = (): string | null => {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return null;
  return localStorage.getItem(DEV_USER_ID_KEY);
};

export const getDevShopId = (): string | null => {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return null;
  return localStorage.getItem(DEV_SHOP_ID_KEY);
};

export const setDevSession = (userId: string, shopId?: string): void => {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  localStorage.setItem(DEV_USER_ID_KEY, userId);
  if (shopId) {
    localStorage.setItem(DEV_SHOP_ID_KEY, shopId);
  } else {
    localStorage.removeItem(DEV_SHOP_ID_KEY);
  }
};

export const clearDevSession = (): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DEV_USER_ID_KEY);
  localStorage.removeItem(DEV_SHOP_ID_KEY);
};

export const isDevSession = (): boolean => {
  return Boolean(getDevUserId());
};
