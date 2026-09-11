'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PickerService = {
  _id: string;
  name: string;
  duration: number;
  basePrice: number;
  category?: string;
  categoryName?: string;
};

type ServicePickerListProps = {
  services: PickerService[];
  selectedIds: string[];
  onToggle: (serviceId: string) => void;
  accentColors?: Record<string, string>;
};

const DEFAULT_ACCENTS = ['border-l-slate-300', 'border-l-rose-400', 'border-l-emerald-400', 'border-l-amber-400'];

export default function ServicePickerList({
  services,
  selectedIds,
  onToggle,
}: ServicePickerListProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const categories = useMemo(() => {
    const cats = new Set<string>(['All']);
    for (const s of services) {
      const cat = s.categoryName || s.category;
      if (cat) cats.add(cat);
    }
    return Array.from(cats);
  }, [services]);

  const filtered = useMemo(() => {
    let list = services;
    if (activeCategory !== 'All') {
      list = list.filter((s) => (s.categoryName || s.category || '') === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    return list;
  }, [services, activeCategory, search]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-100 px-3 py-2.5">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition',
              activeCategory === cat
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 text-slate-600 hover:border-slate-400',
            )}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="border-b border-slate-100 px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search services"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-10 pl-3 text-sm outline-none focus:border-slate-400"
          />
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">No services match</p>
        ) : (
          filtered.map((service, index) => {
            const selected = selectedIds.includes(service._id);
            return (
              <button
                key={service._id}
                type="button"
                onClick={() => onToggle(service._id)}
                className={cn(
                  'flex w-full items-center justify-between border-b border-slate-50 px-4 py-3.5 text-left transition last:border-b-0',
                  'border-l-4',
                  selected ? 'border-l-[#111b65] bg-slate-50' : DEFAULT_ACCENTS[index % DEFAULT_ACCENTS.length],
                )}
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="text-sm font-semibold text-slate-900">{service.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {service.duration} mins | ${service.basePrice.toFixed(2)}
                  </div>
                </div>
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold',
                    selected
                      ? 'border-[#111b65] bg-[#111b65] text-white'
                      : 'border-slate-300 text-slate-500',
                  )}
                >
                  {selected ? '✓' : '+'}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
