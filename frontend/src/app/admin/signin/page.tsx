"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import {
  getIdToken,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { adminAuth as auth } from "@/lib/firebase";
import {
  fetchBackendProfile,
  isAdministratorRole,
  ownerLandingPath,
  safeAdminReturnUrl,
} from "@/lib/adminAuth";
import { authService } from "@/services/auth.service";
import { clearDevSession } from "@/lib/devAuth";

function AdminSignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIdentity, setActiveIdentity] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const returnUrl = useMemo(
    () => safeAdminReturnUrl(searchParams.get("returnUrl")),
    [searchParams],
  );

  const reason = searchParams.get("reason");

  useEffect(() => {
    let cancelled = false;

    const inspectSession = async () => {
      if (status === "loading") return;

      if (status !== "authenticated" || !session) {
        if (!cancelled) {
          setActiveIdentity(null);
          setCheckingSession(false);
        }
        return;
      }

      const accessToken = (session as { accessToken?: string }).accessToken;
      const devUserId = (session as { devUserId?: string }).devUserId;
      const { user } = await fetchBackendProfile({ accessToken, devUserId });

      if (cancelled) return;
      if (!user) { setActiveIdentity(null); setCheckingSession(false); return; }

      if (user && isAdministratorRole(user.roles)) {
        router.replace(returnUrl);
        return;
      }

      setActiveIdentity(
        user?.email ||
          user?.fullName ||
          session.user?.email ||
          session.user?.name ||
          "another account",
      );
      setCheckingSession(false);
    };

    void inspectSession();
    return () => {
      cancelled = true;
    };
  }, [status, session, router, returnUrl]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError("");

    // Do not silently replace an active non-admin session.
    if (activeIdentity) {
      setError(
        "Sign out of the current account before signing in as an administrator.",
      );
      setIsLoading(false);
      return;
    }

    clearDevSession();

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await getIdToken(credential.user, true);

      const { user, status: profileStatus } = await fetchBackendProfile({
        accessToken: idToken,
      });

      if (!user || profileStatus >= 400) {
        await firebaseSignOut(auth).catch(() => undefined);
        setError(
          profileStatus === 401
            ? "Unable to verify this account. Try signing in again."
            : "This account does not have administrator access.",
        );
        return;
      }

      if (!isAdministratorRole(user.roles)) {
        await firebaseSignOut(auth).catch(() => undefined);
        setError("This account does not have administrator access.");
        return;
      }

      const result = await signIn("credentials", {
        idToken,
        redirect: false,
      });

      if (result?.error) {
        await firebaseSignOut(auth).catch(() => undefined);
        setError("Administrator sign-in failed. Please try again.");
        return;
      }

      router.replace(returnUrl);
      router.refresh();
    } catch (err: unknown) {
      await firebaseSignOut(auth).catch(() => undefined);
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      if (
        code.includes("auth/invalid-credential") ||
        code.includes("auth/wrong-password") ||
        code.includes("auth/user-not-found")
      ) {
        setError("Invalid email or password.");
      } else {
        setError("Failed to sign in. Please check your credentials.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (checkingSession && status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">
        Checking session…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
          Administration
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Administrator sign in
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Sign in with an authorized admin or moderator account. Business owners
          should use the shop sign-in instead.
        </p>

        {reason === "session" ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Your session expired. Sign in again to continue.
          </div>
        ) : null}
        {reason === "forbidden" ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Access denied for this account.
          </div>
        ) : null}

        {activeIdentity ? (
          <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="text-slate-700">
              Currently signed in as{" "}
              <span className="font-semibold text-slate-900">{activeIdentity}</span>
              . This account does not have administrator access.
            </p>
            <button
              type="button"
              onClick={() =>
                void authService.signOut({ redirectTo: "/admin/signin" })
              }
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Sign out and use another account
            </button>
            <Link
              href={ownerLandingPath(["owner"])}
              className="block text-center text-sm font-medium text-teal-700 hover:underline"
            >
              Go to business dashboard
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-center text-sm text-rose-700"
              >
                {error}
              </div>
            ) : null}
            <label className="block space-y-1.5">
              <span className="text-sm text-slate-600">Email</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-slate-600">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
              />
            </label>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
            >
              {isLoading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          Looking for the shop dashboard?{" "}
          <Link href="/auth/signin" className="font-medium text-teal-700 hover:underline">
            Owner sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function AdminSignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">
          Loading…
        </div>
      }
    >
      <AdminSignInForm />
    </Suspense>
  );
}
