'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import {
  DEV_AUTH_TOKEN,
  setDevSession,
} from '@/lib/devAuth';
import {
  fetchDevSeedInfo,
  formatDevLoginError,
  resolveDevUserId,
} from '@/lib/devLogin';

/** One-click local owner login — bypasses stuck auth gate during development. */
export default function DevOwnerLoginPage() {
  const [message, setMessage] = useState('Signing in as Test Owner...');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const payload = await fetchDevSeedInfo();
        const devUserId = resolveDevUserId(payload);
        setDevSession(devUserId, payload.shopId || undefined);

        // Don't block on NextAuth — localStorage x-dev-user-id is enough for API
        void signIn('credentials', {
          idToken: DEV_AUTH_TOKEN,
          devUserId,
          redirect: false,
        }).catch(() => undefined);

        if (!cancelled) {
          window.location.replace('/');
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setMessage(formatDevLoginError(err));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef3fb] px-4">
      <div className="rounded-full border border-slate-200 bg-white px-6 py-3 text-sm text-slate-600 shadow-sm">
        {message}
      </div>
    </div>
  );
}
