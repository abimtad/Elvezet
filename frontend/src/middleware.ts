import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Defense-in-depth for /admin/* (except sign-in).
 * Full role authority is re-checked in the protected server layout via /auth/me.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  if (pathname === "/admin/signin" || pathname.startsWith("/admin/signin/")) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: `${process.env.NEXTAUTH_SECRET}:admin`,
    cookieName: "elvezet-admin.session-token",
  });

  if (!token?.accessToken) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/admin/signin";
    signInUrl.searchParams.set("returnUrl", pathname);
    signInUrl.searchParams.set("reason", "session");
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
