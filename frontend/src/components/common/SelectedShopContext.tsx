'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { chosenShop, syncStore } from '@/lib/offline/runtime';
import { getDevShopId, getDevUserId } from '@/lib/devAuth';
import { syncDevSessionFromSeed } from '@/lib/devLogin';

type SelectedShopContextValue = {
  selectedShopId: string;
  setSelectedShopId: (shopId: string) => void;
};

const SelectedShopContext = createContext<SelectedShopContextValue | undefined>(undefined);

export function SelectedShopProvider({ children }: { children: React.ReactNode }) {
  const [selectedShopId, setSelectedShopId] = useState('');
  const offline = useSyncExternalStore(syncStore.subscribe, syncStore.get, syncStore.server);
  useEffect(() => {
    let active = true;
    setSelectedShopId('');
    void chosenShop().then(id => { if (active && id) setSelectedShopId(id); });
    return () => { active = false; };
  }, [offline.scope]);

  useEffect(() => {
    let cancelled = false;

    const bootstrapShop = async () => {
      const cachedShopId = getDevShopId();
      if (cachedShopId && !selectedShopId) {
        setSelectedShopId(cachedShopId);
      }

      if (!getDevUserId()) {
        return;
      }

      const payload = await syncDevSessionFromSeed();
      if (cancelled || !payload?.shopId) {
        return;
      }

      setSelectedShopId((current) =>
        current === payload.shopId ? current : payload.shopId || current,
      );
    };

    void bootstrapShop();

    return () => {
      cancelled = true;
    };
  }, [selectedShopId]);

  return (
    <SelectedShopContext.Provider value={{ selectedShopId, setSelectedShopId: id => { setSelectedShopId(id); void chosenShop(id); } }}>
      {children}
    </SelectedShopContext.Provider>
  );
}

export function useSelectedShop() {
  const context = useContext(SelectedShopContext);
  if (!context) {
    throw new Error('useSelectedShop must be used within SelectedShopProvider');
  }

  return context;
}
