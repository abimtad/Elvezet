'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  getIdToken,
  updateProfile
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Link from 'next/link';
import {
  clearDevSession,
  DEFAULT_DEV_ADMIN_FIREBASE_UID,
  DEV_AUTH_TOKEN,
  setDevSession,
} from '@/lib/devAuth';
import {
  fetchDevSeedInfo,
  formatDevLoginError,
  resolveDevUserId,
} from '@/lib/devLogin';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDevLoading, setIsDevLoading] = useState(false);
  const [error, setError] = useState('');
  const [devHint, setDevHint] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    clearDevSession();

    try {
      // 1. Sign in with Firebase Client SDK
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await getIdToken(userCredential.user);

      // 2. Authorize with NextAuth using the Firebase ID Token
      const result = await signIn('credentials', {
        idToken,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else {
        router.push('/application');
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevLogin = async (devMode: "owner" | "admin") => {
    setIsDevLoading(true);
    setError('');
    setDevHint('');

    try {
      const payload = await fetchDevSeedInfo();
      const devUserId =
        devMode === "admin"
          ? payload.adminId || payload.adminFirebaseUid || DEFAULT_DEV_ADMIN_FIREBASE_UID
          : resolveDevUserId(payload);

      if (payload._warning) {
        setDevHint(payload._warning);
      }

      setDevSession(
        devUserId,
        devMode === "owner" ? payload.shopId || undefined : undefined,
      );

      const result = await signIn('credentials', {
        idToken: DEV_AUTH_TOKEN,
        devUserId,
        redirect: false,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      window.location.href = devMode === "admin" ? '/admin/overview' : '/';
    } catch (err: unknown) {
      clearDevSession();
      setError(formatDevLoginError(err));
    } finally {
      setIsDevLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-6">Business sign in</h2>
        
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4 text-sm text-center">
            {error}
          </div>
        )}

        {devHint && !error ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-center text-xs text-amber-800">
            {devHint}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="you@example.com"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {process.env.NODE_ENV !== 'production' ? (
          <div className="mt-6 border-t border-gray-200 pt-6">
            <button
              type="button"
              onClick={() => void handleDevLogin('owner')}
              disabled={isDevLoading}
              className="w-full rounded-md border-2 border-dashed border-[#111b65] bg-[#f1f4ff] py-2.5 text-sm font-semibold text-[#111b65] transition hover:bg-[#e8ecff] disabled:opacity-50"
            >
              {isDevLoading ? 'Connecting...' : 'Login as Test Owner'}
            </button>
            <button
              type="button"
              onClick={() => void handleDevLogin('admin')}
              disabled={isDevLoading}
              className="mt-3 w-full rounded-md border-2 border-dashed border-emerald-700 bg-emerald-50 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              {isDevLoading ? 'Connecting...' : 'Login as Test Admin'}
            </button>
            <p className="mt-2 text-center text-xs text-gray-500">
              Shop owner for <span className="font-medium">Must Dash</span> (booking grid, staff, inventory).
              Not platform admin — use <span className="font-medium">/admin</span> separately.
            </p>
            <p className="mt-1 text-center text-[11px] text-gray-400">
              Requires MongoDB + <code className="rounded bg-gray-100 px-1">npm run seed:mustdash</code> + API on port 5000.
            </p>
          </div>
        ) : null}

        <p className="mt-6 text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <Link href="/auth/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
