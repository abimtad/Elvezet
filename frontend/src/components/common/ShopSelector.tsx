'use client';

import { useBusinesses } from '@/hooks/useBusiness';
import { Business } from '@/types';
import { useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useSelectedShop } from './SelectedShopContext';
import { getDevShopId } from '@/lib/devAuth';

interface ShopSelectorProps {
  onSelect: (shopId: string) => void;
  selectedShopId?: string;
}

export default function ShopSelector({ onSelect, selectedShopId }: ShopSelectorProps) {
  const { data: businesses, isLoading } = useBusinesses();
  const {
    selectedShopId: contextShopId,
    setSelectedShopId: setContextShopId,
  } = useSelectedShop();

  const resolvedSelectedShopId = selectedShopId ?? contextShopId;

  useEffect(() => {
    const devShopId = getDevShopId();
    if (devShopId) {
      setContextShopId(devShopId);
      onSelect(devShopId);
      return;
    }

    if (businesses && businesses.length > 0 && !resolvedSelectedShopId) {
      const defaultShopId = businesses[0].id;
      setContextShopId(defaultShopId);
      onSelect(defaultShopId);
    }
  }, [businesses, resolvedSelectedShopId, onSelect, setContextShopId]);

  if (isLoading) {
    return (
      <div className="h-11 w-48 animate-pulse rounded-2xl bg-slate-200" />
    );
  }

  return (
    <div className="relative">
      <select
        id="shop-select"
        value={resolvedSelectedShopId || ''}
        onChange={(e) => {
          setContextShopId(e.target.value);
          onSelect(e.target.value);
        }}
        className="h-11 appearance-none rounded-2xl border border-[#e5e7eb] bg-white py-2 pl-4 pr-10 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400 focus:ring-0 cursor-pointer"
      >
        <option value="" disabled className="text-slate-500">Select Shop</option>
        {businesses?.map((shop: Business) => (
          <option key={shop.id} value={shop.id} className="bg-white text-slate-700">
            {shop.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}
