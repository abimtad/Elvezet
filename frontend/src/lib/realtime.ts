import { io, type Socket } from 'socket.io-client';
import { getSession } from 'next-auth/react';
import { getDevUserId } from './devAuth';
import { auth } from './firebase';

let dashboardSocket: Socket | null = null;
let workspaceId: string | undefined;

const resolveSocketUrl = (): string => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

  try {
    const url = new URL(apiUrl);
    url.pathname = url.pathname.replace(/\/api(?:\/v\d+)?\/?$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return 'http://localhost:5000';
  }
};

/**
 * Authenticated dashboard socket for one business workspace.
 * Token is refreshed on every connect via the auth callback.
 * Switching businessId disconnects and recreates so the handshake
 * carries the newly selected workspace (required for room join).
 */
export const getDashboardSocket = (businessId: string): Socket => {
  if (!businessId) {
    throw new Error('A business ID is required for the dashboard socket');
  }

  if (dashboardSocket && workspaceId !== businessId) {
    dashboardSocket.removeAllListeners();
    dashboardSocket.disconnect();
    dashboardSocket = null;
  }

  workspaceId = businessId;

  if (!dashboardSocket) {
    dashboardSocket = io(resolveSocketUrl(), {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      withCredentials: true,
      auth: (done) => {
        void (async () => {
          const activeBusinessId = workspaceId;
          if (!activeBusinessId) {
            done({});
            return;
          }

          const devUserId = getDevUserId();
          const token = auth?.currentUser
            ? await auth.currentUser.getIdToken()
            : ((await getSession()) as { accessToken?: string } | null)
                ?.accessToken;

          done({
            token,
            businessId: activeBusinessId,
            ...(devUserId ? { devUserId } : {}),
          });
        })().catch(() => done({}));
      },
    });

    dashboardSocket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect' && workspaceId) {
        dashboardSocket?.connect();
      }
    });
  }

  return dashboardSocket;
};
