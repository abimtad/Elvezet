import { signOut as nextAuthSignOut } from "next-auth/react";
import { signOut as firebaseSignOut } from "firebase/auth";
import api from "@/lib/axios";
import { auth, adminAuth } from "@/lib/firebase";
import { clearDevSession } from "@/lib/devAuth";
import { beforeLogout } from '@/lib/offline/runtime';

export interface SignUpData {
  firebaseUid: string;
  fullName: string;
  email: string;
  phoneNumber?: string;
}

type CurrentUser = {
  _id?: string;
  id?: string;
  fullName?: string;
  email?: string;
  roles?: string[];
  firebaseUid?: string;
  needsPasswordReset?: boolean;
};

export const authService = {
  signUp: async (data: SignUpData) => {
    const response = await api.post("/auth/signup", data);
    return response.data;
  },

  getCurrentUser: async (): Promise<CurrentUser | null> => {
    const response = await api.get("/auth/me", { timeout: 8000 });
    const payload = response.data;
    const raw = (payload?.data ?? payload) as CurrentUser & {
      toObject?: () => CurrentUser;
      _doc?: CurrentUser;
    };
    if (raw && typeof raw === "object" && "_doc" in raw && raw._doc) {
      return raw._doc;
    }
    return raw as CurrentUser;
  },

  changePassword: async (newPassword: string) => {
    const response = await api.patch("/auth/change-password", { newPassword });
    return response.data;
  },

  signOut: async (options?: { redirectTo?: string }) => {
    if (typeof window === "undefined") return;
    if (!window.location.pathname.startsWith("/admin") && !(await beforeLogout())) return;

    clearDevSession();

    try {
      await firebaseSignOut(window.location.pathname.startsWith("/admin") ? adminAuth : auth);
    } catch {
      // Firebase may already be signed out.
    }

    try {
      await nextAuthSignOut({ redirect: false });
    } catch {
      // NextAuth session may already be cleared.
    }

    try {
      // Firebase apps and portal sessions must survive the other portal signing out.
      if (!window.location.pathname.startsWith("/admin")) {
        localStorage.removeItem("selectedShopId");
        sessionStorage.removeItem("selectedShopId");
      }
    } catch {
      // Storage may be unavailable.
    }

    window.location.href = options?.redirectTo || "/auth/signin";
  },
};
