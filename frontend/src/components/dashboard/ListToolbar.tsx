'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type Chip = {
  id: string;
  label: string;
};

export function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 text-sm font-medium transition',
        active
          ? 'text-[#111b65] underline decoration-2 underline-offset-8'
          : 'text-slate-500 hover:text-slate-800',
      )}
    >
      {label}
    </button>
  );
}

export default function ListToolbar({
  search,
  onSearch,
  placeholder = 'Search…',
  chips,
  activeChip,
  onChip,
  trailing,
  countLabel,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  chips?: Chip[];
  activeChip?: string;
  onChip?: (id: string) => void;
  trailing?: React.ReactNode;
  countLabel?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="relative block min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
            className="w-full border-0 border-b border-slate-200 bg-transparent py-2.5 pl-7 pr-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#111b65]"
          />
        </label>
        {trailing}
      </div>
      {(chips?.length || countLabel) && (
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 pb-1">
          {chips?.map((chip) => (
            <FilterChip
              key={chip.id}
              label={chip.label}
              active={activeChip === chip.id}
              onClick={() => onChip?.(chip.id)}
            />
          ))}
          {countLabel ? (
            <span className="ml-auto px-2 text-xs text-slate-400">{countLabel}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

export const fieldClass =
  'w-full border-0 border-b border-slate-200 bg-transparent px-0 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#111b65]';
