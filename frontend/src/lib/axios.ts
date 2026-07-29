import axios from "axios";
import { getSession } from "next-auth/react";
import { DEV_AUTH_TOKEN, getDevUserId } from "./devAuth";
import { auth } from './firebase';
import { canRead, writable } from './offline/policy';
import { configureSync, setIdentity, syncStore, snapshot, saveSnapshot, queueChange, pendingData, connection, safeStaffBody } from './offline/runtime';

declare module 'axios' {
  interface AxiosRequestConfig { offlineBypass?: boolean; offlineScope?: string; offlineExpectedScope?: string; }
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(async (config) => {
  const adminPage = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
  if (!adminPage && typeof window !== 'undefined') {
    try {
      if (auth) await auth.authStateReady();
      if (auth?.currentUser) {
        await setIdentity(auth.currentUser.uid);
        config.offlineScope = syncStore.get().scope;
        if (navigator.onLine) {
          try {
            const token = await Promise.race([auth.currentUser.getIdToken(), new Promise<null>(resolve => setTimeout(() => resolve(null), 5000))]);
            if (token) config.headers.Authorization = `Bearer ${token}`;
          } catch { /* Saved viewing remains available. */ }
        }
      } else if (!navigator.onLine) {
        await setIdentity(null, true);
        config.offlineScope = syncStore.get().scope;
      }
    } catch { /* Fall back to the existing portal session lookup. */ }
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return config;
  if (!adminPage && config.offlineScope && config.headers.Authorization) return config;
  const devUserId = getDevUserId();
  if (devUserId) {
    config.headers["x-dev-user-id"] = devUserId;
    config.headers.Authorization = `Bearer ${DEV_AUTH_TOKEN}`;
    return config;
  }

  try {
    const session = (await Promise.race([
      typeof window !== "undefined" && window.location.pathname.startsWith("/admin")
        ? fetch("/api/admin-auth/session", {cache:"no-store"}).then(response=>response.json())
        : getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ])) as { accessToken?: string } | null;
    if (session?.accessToken && session.accessToken !== DEV_AUTH_TOKEN) {
      config.headers.Authorization ||= `Bearer ${session.accessToken}`;
      if (!adminPage) {
        try {
          const part = session.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
          const claims = JSON.parse(atob(part));
          await setIdentity(claims.user_id || claims.sub);
          config.offlineScope = syncStore.get().scope;
        } catch { /* Never use malformed tokens as offline identities. */ }
      }
    }
  } catch {
    // Session lookup can hang in NextAuth — fail open for request
  }
  return config;
});

const transport = axios.getAdapter(api.defaults.adapter);
api.defaults.adapter = async config => {
  if (config.offlineExpectedScope && config.offlineScope !== config.offlineExpectedScope) throw new Error('Account changed before sync. Sign in to the original account to sync its work.');
  const scope = config.offlineScope || '';
  const path = config.url || '';
  const method = (config.method || 'GET').toUpperCase();
  const isOwnerPage = typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin');
  if (!isOwnerPage || config.offlineBypass || !scope) return transport(config);
  if (window.location.pathname === '/settings/payments' && /^\/businesses\/[a-f\d]{24}$/.test(path)) return transport(config);
  const reply = (data: any, cached = false) => ({ data, status: 200, statusText: cached ? 'Saved offline' : 'OK', config, headers: { 'x-zolmi-offline': cached ? '1' : '0' } });
  if (method === 'GET' && canRead(path)) {
    try {
      if (!navigator.onLine || syncStore.get().offline) throw new Error('Offline');
      const response = await transport({ ...config, timeout: config.timeout || 8000 });
      // Axios normally parses JSON *after* its adapter returns. The offline
      // store and pending-record projection need that parsed payload here.
      if (typeof response.data === 'string') response.data = JSON.parse(response.data);
      connection(false);
      await saveSnapshot(scope, path, config.params, response.data);
      response.data = await pendingData(scope, path, config.params, response.data);
      return response;
    } catch (error: any) {
      // An authorization or validation failure must never become cached success.
      if (error?.response && ![502, 503, 504].includes(error.response.status)) throw error;
      const saved = await snapshot(scope, path, config.params);
      if (saved) { connection(true); return reply(saved.data, true); }
      throw new Error('This page has not been saved on this device. Connect once to load it.');
    }
  }
  let body = typeof config.data === 'string' ? (() => { try { return JSON.parse(config.data); } catch { return null; } })() : config.data;
  if (method === 'PATCH') body = await safeStaffBody(scope, path, body);
  const shop = writable(path, method, body);
  if (shop) {
    // All supported writes enter the durable outbox BEFORE any send. The runtime
    // replays them through the transactional, idempotent sync endpoint.
    try {
      const result = await queueChange(path, method, body);
      void import('./offline/runtime').then(runtime => runtime.syncNow());
      return reply(result, true);
    } catch (error: any) {
      if (navigator.onLine && /offline update is deployed/.test(error.message)) return transport(config);
      throw error;
    }
  }
  if (!navigator.onLine && method !== 'GET') throw new Error('This action requires internet. Your changes have not been submitted.');
  return transport(config);
};

export default api;

configureSync(api.defaults.baseURL || '', async (path, body, expectedScope, method) => {
  const response = await api.request({ url: path, method: method || (body === null ? 'GET' : 'POST'), data: body, offlineBypass: true, offlineExpectedScope: expectedScope, timeout: 15000 });
  return response.data;
}, () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('zolmi-offline-refresh')); });
