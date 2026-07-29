'use client';

import { usePathname } from 'next/navigation';
import OwnerGate from '@/components/common/OwnerGate';
import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { SelectedShopProvider } from '@/components/common/SelectedShopContext';
import OfflineWorkspace from '@/components/common/OfflineWorkspace';
import { syncStore } from '@/lib/offline/runtime';

export default function Providers({ children }: { children: React.ReactNode }) {
  const admin = usePathname().startsWith('/admin');
  const state = useSyncExternalStore(syncStore.subscribe, syncStore.get, syncStore.server);
  return <SessionProvider key={admin ? 'admin' : 'business'} basePath={admin ? '/api/admin-auth' : '/api/auth'} refetchInterval={0} refetchOnWindowFocus={false}>
    <WorkspaceData key={`${admin ? 'admin' : 'business'}:${state.scope || 'signed-out'}`} admin={admin}>{children}</WorkspaceData>
  </SessionProvider>;
}

function WorkspaceData({ children, admin }: { children: React.ReactNode; admin: boolean }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: {
    // Requests must reach the offline adapter even when TanStack detects no
    // connection; otherwise it pauses cached reads and local saves entirely.
    queries: { networkMode: 'always', retry: (count) => typeof navigator !== 'undefined' && navigator.onLine && count < 1 },
    mutations: { networkMode: 'always', retry: false },
  } }));
  useEffect(() => () => queryClient.clear(), [queryClient]);

  return (
      <QueryClientProvider client={queryClient}>
        <SelectedShopProvider>{admin ? children : <OwnerGate>{children}</OwnerGate>}{!admin && <OfflineWorkspace />}</SelectedShopProvider>
      </QueryClientProvider>
  );
}
