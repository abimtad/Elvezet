'use client';

import PageShell, { PageHeader } from '@/components/common/PageShell';
import ShopSelector from '@/components/common/ShopSelector';
import { useSelectedShop } from '@/components/common/SelectedShopContext';
import { useBusiness } from '@/hooks/useBusiness';
import EarningsStatement from '@/components/dashboard/EarningsStatement';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

type Member = {
  beneficiary: string;
  name: string;
  active: boolean;
};

export default function TeamPage() {
  const { selectedShopId, setSelectedShopId } = useSelectedShop();
  const { data: business } = useBusiness(selectedShopId || '');
  const [search, setSearch] = useState('');
  const [beneficiary, setBeneficiary] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const { data: staff, isPending, isError, refetch } = useQuery<Member[]>({
    queryKey: ['earnings-beneficiaries', selectedShopId],
    enabled: !!selectedShopId,
    queryFn: async () =>
      (await api.get(`/earnings/${selectedShopId}`)).data.data,
  });

  const members = staff || [];
  const isIndependent = business?.type === 'independent';

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return members.filter((m) => {
      if (!showArchived && !m.active) return false;
      if (!needle) return true;
      return m.name.toLowerCase().includes(needle);
    });
  }, [members, search, showArchived]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Operations"
        title="Team"
        description="Pick a staff member to review earnings. Profiles and hours live under Staff."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <ShopSelector
              selectedShopId={selectedShopId}
              onSelect={setSelectedShopId}
            />
            <Link
              href="/staff"
              className="text-sm font-medium text-[#111b65] underline underline-offset-8"
            >
              Manage staff
            </Link>
          </div>
        }
      />

      {!selectedShopId ? (
        <p className="py-16 text-center text-sm text-slate-500">
          Select a shop to view team earnings.
        </p>
      ) : isPending ? (
        <p className="py-10 text-sm text-slate-500">Loading staff…</p>
      ) : isError ? (
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm font-medium text-rose-600 underline"
        >
          Could not load staff. Retry
        </button>
      ) : isIndependent ? (
        <EarningsStatement
          key={selectedShopId}
          businessId={selectedShopId}
          beneficiary="self"
        />
      ) : (
        <div className="space-y-8">
          <div className="space-y-4">
            <label className="block max-w-md">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Find staff
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type a name…"
                className="mt-1 w-full border-0 border-b border-slate-200 bg-transparent py-2.5 text-sm outline-none focus:border-[#111b65]"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className={cn(
                  'font-medium',
                  showArchived
                    ? 'text-[#111b65] underline underline-offset-8'
                    : 'text-slate-500 hover:text-slate-800',
                )}
              >
                {showArchived ? 'Showing archived' : 'Hide archived'}
              </button>
              <span className="text-slate-400">
                {visible.length} member{visible.length === 1 ? '' : 's'}
              </span>
            </div>

            {visible.length === 0 ? (
              <p className="py-8 text-sm text-slate-500">
                No staff found for this business.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-x-4 gap-y-2">
                {visible.map((m) => {
                  const active = beneficiary === m.beneficiary;
                  return (
                    <li key={m.beneficiary}>
                      <button
                        type="button"
                        onClick={() => setBeneficiary(m.beneficiary)}
                        className={cn(
                          'py-1 text-sm font-medium transition',
                          active
                            ? 'text-[#111b65] underline decoration-2 underline-offset-8'
                            : 'text-slate-600 hover:text-slate-900',
                          !m.active && 'opacity-50',
                        )}
                      >
                        {m.name}
                        {!m.active ? ' · archived' : ''}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {beneficiary &&
          members.some((m) => m.beneficiary === beneficiary) ? (
            <EarningsStatement
              key={`${selectedShopId}:${beneficiary}`}
              businessId={selectedShopId}
              beneficiary={beneficiary}
            />
          ) : (
            <p className="text-sm text-slate-500">
              Select a staff member above to open their earnings statement.
            </p>
          )}
        </div>
      )}
    </PageShell>
  );
}
