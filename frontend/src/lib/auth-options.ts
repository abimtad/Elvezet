import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import {
  fetchBackendProfile,
  type BackendUserProfile,
} from "@/lib/adminAuth";

const isProduction = process.env.NODE_ENV === "production";

export function createAuthOptions(administrator = false): NextAuthOptions { return {
  providers: [
    CredentialsProvider({
      name: "Firebase Token",
      credentials: {
        idToken: { label: "ID Token", type: "text" },
        devUserId: { label: "Dev User ID", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.idToken) return null;

        // Dev-only shortcut — never available in production.
        if (credentials.idToken === "__dev_owner__" && credentials.devUserId) {
          if (isProduction || administrator) return null;

          const { user } = await fetchBackendProfile({
            accessToken: "__dev_owner__",
            devUserId: credentials.devUserId,
          });

          if (!user) {
            return {
              id: credentials.devUserId,
              accessToken: "__dev_owner__",
              devUserId: credentials.devUserId,
              roles: [] as string[],
            };
          }

          return profileToAuthUser(user, {
            accessToken: "__dev_owner__",
            devUserId: credentials.devUserId,
          });
        }

        if (credentials.idToken === "__dev_owner__") {
          return null;
        }

        // Authority: backend user record after Firebase verification on the API.
        const { user, status } = await fetchBackendProfile({
          accessToken: credentials.idToken,
        });

        if (!user || status >= 400) return null;
        if (administrator && !user.roles?.some(role => role === "admin" || role === "moderator")) return null;

        return profileToAuthUser(user, {
          accessToken: credentials.idToken,
        });
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as {
          accessToken?: string;
          devUserId?: string;
          roles?: string[];
          email?: string | null;
          name?: string | null;
          id?: string;
        };
        token.accessToken = u.accessToken;
        token.devUserId = u.devUserId;
        token.roles = Array.isArray(u.roles) ? u.roles : [];
        token.email = u.email ?? token.email;
        token.name = u.name ?? token.name;
        token.uid = u.id;
      }
      return token;
    },
    async session({ session, token }) {
      const s = session as {
        accessToken?: string;
        devUserId?: string;
        roles?: string[];
        user?: { name?: string | null; email?: string | null };
      };
      s.accessToken = token.accessToken as string | undefined;
      s.devUserId = token.devUserId as string | undefined;
      s.roles = Array.isArray(token.roles) ? (token.roles as string[]) : [];
      if (s.user) {
        s.user.email = (token.email as string | undefined) ?? s.user.email;
        s.user.name = (token.name as string | undefined) ?? s.user.name;
      }
      return session;
    },
  },
  pages: {
    signIn: administrator ? "/admin/signin" : "/auth/signin",
  },
  session: {
    strategy: "jwt",
    maxAge: 55 * 60,
  },
  secret: administrator ? `${process.env.NEXTAUTH_SECRET}:admin` : process.env.NEXTAUTH_SECRET,
  ...(administrator ? {cookies: {
    sessionToken: {name:"elvezet-admin.session-token",options:{httpOnly:true,sameSite:"lax" as const,path:"/",secure:isProduction}},
    csrfToken: {name:"elvezet-admin.csrf-token",options:{httpOnly:true,sameSite:"lax" as const,path:"/",secure:isProduction}},
    callbackUrl: {name:"elvezet-admin.callback-url",options:{sameSite:"lax" as const,path:"/",secure:isProduction}},
  }} : {}),
}; }
export const authOptions=createAuthOptions();
export const adminAuthOptions=createAuthOptions(true);

function profileToAuthUser(
  user: BackendUserProfile,
  tokens: { accessToken: string; devUserId?: string },
) {
  const id = String(user._id || user.id || user.firebaseUid || "user");
  return {
    id,
    accessToken: tokens.accessToken,
    devUserId: tokens.devUserId,
    email: user.email || null,
    name: user.fullName || null,
    roles: Array.isArray(user.roles) ? user.roles : [],
  };
}
