'use client';

import PageShell, { PageHeader } from '@/components/common/PageShell';
import ShopSelector from '@/components/common/ShopSelector';
import { useSelectedShop } from '@/components/common/SelectedShopContext';
import ListToolbar from '@/components/dashboard/ListToolbar';
import { dashboardService } from '@/services/dashboard.service';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Clock, DollarSign, Mail, Phone, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Client = {
  _id: string;
  fullName: string;
  phoneNumber?: string;
  email?: string;
  lastVisit?: string;
  totalSpend?: number;
  notes?: string;
};

type VisitFilter = 'all' | 'recent' | 'stale' | 'never';
type SpendFilter = 'all' | 'high' | 'mid' | 'low';
type SortKey = 'name' | 'spend' | 'visit';

function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const AVATAR_COLORS = [
  'bg-amber-500/15 text-amber-700',
  'bg-emerald-500/15 text-emerald-700',
  'bg-sky-500/15 text-sky-700',
  'bg-violet-500/15 text-violet-700',
  'bg-rose-500/15 text-rose-700',
];

function avatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function daysSince(date?: string) {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
}

export default function ClientsPage() {
  const { selectedShopId, setSelectedShopId } = useSelectedShop();
  const [search, setSearch] = useState('');
  const [visitFilter, setVisitFilter] = useState<VisitFilter>('all');
  const [spendFilter, setSpendFilter] = useState<SpendFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [selected, setSelected] = useState<Client | null>(null);
  useEffect(() => { setSelected(null); }, [selectedShopId]);

  const { data, isLoading } = useQuery({
    queryKey: ['clients-list', selectedShopId],
    queryFn: () => dashboardService.searchClients(selectedShopId, ''),
    enabled: !!selectedShopId,
  });

  const allClients: Client[] =
    (data as { clients?: Client[] } | undefined)?.clients || [];

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let rows = allClients.filter((c) => {
      if (needle) {
        const hay = [
          c.fullName,
          c.phoneNumber,
          c.email,
          c.notes,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }

      const days = daysSince(c.lastVisit);
      if (visitFilter === 'recent' && (days === null || days > 30)) return false;
      if (visitFilter === 'stale' && (days === null || days <= 30)) return false;
      if (visitFilter === 'never' && days !== null) return false;

      const spend = Number(c.totalSpend || 0);
      if (spendFilter === 'high' && spend < 2000) return false;
      if (spendFilter === 'mid' && (spend < 500 || spend >= 2000)) return false;
      if (spendFilter === 'low' && spend >= 500) return false;

      return true;
    });

    rows = [...rows].sort((a, b) => {
      if (sortKey === 'spend') {
        return Number(b.totalSpend || 0) - Number(a.totalSpend || 0);
      }
      if (sortKey === 'visit') {
        const at = a.lastVisit ? new Date(a.lastVisit).getTime() : 0;
        const bt = b.lastVisit ? new Date(b.lastVisit).getTime() : 0;
        return bt - at;
      }
      return (a.fullName || '').localeCompare(b.fullName || '');
    });

    return rows;
  }, [allClients, search, visitFilter, spendFilter, sortKey]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="CRM"
        title="Clients"
        description="Find regulars and walk-ins, then open a light profile."
        actions={
          <ShopSelector
            selectedShopId={selectedShopId}
            onSelect={setSelectedShopId}
          />
        }
      />

      {!selectedShopId ? (
        <p className="py-16 text-center text-sm text-slate-500">
          Select a shop to view its clients.
        </p>
      ) : isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <ListToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search name, phone, email, or notes…"
            countLabel={`${filtered.length} of ${allClients.length}`}
            chips={[
              { id: 'all', label: 'All visits' },
              { id: 'recent', label: 'Last 30 days' },
              { id: 'stale', label: 'Older' },
              { id: 'never', label: 'No visit date' },
            ]}
            activeChip={visitFilter}
            onChip={(id) => setVisitFilter(id as VisitFilter)}
          />

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-slate-400">Spend</span>
            {(
              [
                ['all', 'Any'],
                ['high', '2k+'],
                ['mid', '500–2k'],
                ['low', 'Under 500'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSpendFilter(id)}
                className={cn(
                  'font-medium',
                  spendFilter === id
                    ? 'text-[#111b65] underline underline-offset-8'
                    : 'text-slate-500 hover:text-slate-800',
                )}
              >
                {label}
              </button>
            ))}
            <span className="ml-2 text-slate-400">Sort</span>
            {(
              [
                ['name', 'Name'],
                ['spend', 'Spend'],
                ['visit', 'Last visit'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSortKey(id)}
                className={cn(
                  'font-medium',
                  sortKey === id
                    ? 'text-[#111b65] underline underline-offset-8'
                    : 'text-slate-500 hover:text-slate-800',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="py-14 text-center text-sm text-slate-500">
              No clients match these filters.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((client) => (
                <li key={client._id}>
                  <button
                    type="button"
                    onClick={() => setSelected(client)}
                    className="flex w-full items-center gap-4 py-3.5 text-left transition hover:bg-slate-50/80"
                  >
                    <div
                      className={cn(
                        'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                        avatarColor(client.fullName),
                      )}
                    >
                      {initials(client.fullName || 'C')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-900">
                        {client.fullName}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                        {client.phoneNumber ? (
                          <span>{client.phoneNumber}</span>
                        ) : null}
                        {client.email ? (
                          <span className="truncate">{client.email}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="hidden flex-shrink-0 text-right sm:block">
                      <div className="text-sm font-semibold text-slate-900">
                        {Number(client.totalSpend || 0).toFixed(0)} ETB
                      </div>
                      <div className="text-xs text-slate-400">
                        {client.lastVisit
                          ? new Date(client.lastVisit).toLocaleDateString()
                          : 'No visit'}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {selected ? (
        <div className="fixed inset-0 z-50 flex bg-black/20 backdrop-blur-sm">
          <div className="ml-auto flex h-full w-full max-w-sm flex-col overflow-y-auto bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                Client
              </p>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-6 p-5">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    'flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full text-lg font-semibold',
                    avatarColor(selected.fullName),
                  )}
                >
                  {initials(selected.fullName)}
                </div>
                <div>
                  <div className="text-lg font-semibold text-slate-900">
                    {selected.fullName}
                  </div>
                  {selected.phoneNumber ? (
                    <div className="mt-0.5 text-sm text-slate-500">
                      {selected.phoneNumber}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <DollarSign className="h-4 w-4 text-slate-400" />
                  <div className="mt-2 text-xl font-semibold text-slate-900">
                    {Number(selected.totalSpend || 0).toFixed(0)}
                  </div>
                  <div className="text-xs text-slate-500">Total spend (ETB)</div>
                </div>
                <div>
                  <Clock className="h-4 w-4 text-slate-400" />
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {selected.lastVisit
                      ? new Date(selected.lastVisit).toLocaleDateString()
                      : '—'}
                  </div>
                  <div className="text-xs text-slate-500">Last visit</div>
                </div>
              </div>

              <div className="space-y-3 text-sm text-slate-600">
                {selected.email ? (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <span className="truncate">{selected.email}</span>
                  </div>
                ) : null}
                {selected.phoneNumber ? (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <span>{selected.phoneNumber}</span>
                  </div>
                ) : null}
              </div>

              {selected.notes ? (
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                    Notes
                  </p>
                  <p className="text-sm leading-relaxed text-slate-600">
                    {selected.notes}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
