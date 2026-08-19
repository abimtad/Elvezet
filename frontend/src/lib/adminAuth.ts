export type BackendUserProfile = {
  _id?: string;
  id?: string;
  fullName?: string;
  email?: string;
  roles?: string[];
  firebaseUid?: string;
};

export const ADMIN_ROLES = ["admin", "moderator"] as const;

export const isAdministratorRole = (roles?: string[] | null): boolean => {
  if (!Array.isArray(roles)) return false;
  return roles.some((role) => role === "admin" || role === "moderator");
};

export const ownerLandingPath = (roles?: string[] | null): string => {
  if (Array.isArray(roles) && (roles.includes("owner") || roles.includes("staff"))) {
    return "/";
  }
  return "/auth/signin";
};

/** Only allow same-origin relative return paths under /admin. */
export const safeAdminReturnUrl = (raw?: string | null): string => {
  if (!raw) return "/admin/overview";
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//")) return "/admin/overview";
  if (!value.startsWith("/admin")) return "/admin/overview";
  if (value.startsWith("/admin/signin")) return "/admin/overview";
  return value;
};

export const getApiBaseUrl = (): string =>
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";

export const unwrapUserPayload = (payload: unknown): BackendUserProfile | null => {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as { data?: unknown; _doc?: BackendUserProfile };
  const raw = (root.data ?? payload) as BackendUserProfile & {
    _doc?: BackendUserProfile;
    toObject?: () => BackendUserProfile;
  };
  if (raw && typeof raw === "object" && raw._doc) return raw._doc;
  if (raw && typeof raw === "object" && typeof raw.toObject === "function") {
    return raw.toObject();
  }
  return raw as BackendUserProfile;
};

export async function fetchBackendProfile(options: {
  accessToken?: string | null;
  devUserId?: string | null;
}): Promise<{ user: BackendUserProfile | null; status: number }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  // Dev auth headers are never sent in production builds.
  const isDev = process.env.NODE_ENV === "development";

  if (isDev && options.devUserId) {
    headers["x-dev-user-id"] = options.devUserId;
    headers.Authorization = `Bearer ${options.accessToken || "__dev_owner__"}`;
  } else if (options.accessToken && options.accessToken !== "__dev_owner__") {
    headers.Authorization = `Bearer ${options.accessToken}`;
  } else {
    return { user: null, status: 401 };
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
      method: "GET",
      headers,
      cache: "no-store",
    });
    if (!response.ok) {
      return { user: null, status: response.status };
    }
    const payload = await response.json();
    return { user: unwrapUserPayload(payload), status: response.status };
  } catch {
    return { user: null, status: 0 };
  }
}

export function classifyRequestError(error: unknown): "session" | "forbidden" | "network" {
  const status =
    typeof error === "object" &&
    error &&
    "response" in error &&
    typeof (error as { response?: { status?: number } }).response?.status === "number"
      ? (error as { response: { status: number } }).response.status
      : undefined;

  if (status === 401) return "session";
  if (status === 403) return "forbidden";
  return "network";
}
