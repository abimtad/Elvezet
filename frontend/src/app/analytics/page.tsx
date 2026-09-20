'use client';

import Sidebar from '@/components/common/Sidebar';
import ShopSelector from '@/components/common/ShopSelector';
import { useSelectedShop } from '@/components/common/SelectedShopContext';
import { dashboardService } from '@/services/dashboard.service';
import { classifyRequestError } from '@/lib/adminAuth';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarCheck,
  Filter,
  RefreshCw,
  Search,
  Smartphone,
  TrendingUp,
  UserRound,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';

const todayInputValue = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const formatMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const API_ORIGIN = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1'
).replace(/\/api\/v1\/?$/, '');

const mediaUrl = (path?: string) => {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
};

const avatarPalette = [
  'bg-rose-100 text-rose-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-800',
  'bg-sky-100 text-sky-700',
];

const formatBookingWhen = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const statusStyles: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  confirmed: 'bg-sky-50 text-sky-700 ring-sky-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-200',
  'no-show': 'bg-slate-100 text-slate-600 ring-slate-200',
  no_show: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default function AnalyticsPage() {
  const router = useRouter();
  const { selectedShopId, setSelectedShopId } = useSelectedShop();
  const [range, setRange] = useState<'day' | 'week' | 'month'>('week');
  const [refDate] = useState(todayInputValue());
  const [bookingSearch, setBookingSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'customer'>('newest');

  const analyticsQuery = useQuery({
    queryKey: ['analytics', selectedShopId, range, refDate],
    queryFn: () => dashboardService.getAnalytics(selectedShopId, range, refDate),
    enabled: !!selectedShopId,
  });

  const data = analyticsQuery.data;
  const maxPeak = Math.max(...(data?.peakHours.map((h) => h.count) || [1]), 1);
  const analyticsErrorKind = analyticsQuery.isError
    ? classifyRequestError(analyticsQuery.error)
    : null;

  const recentBookings = useMemo(() => {
    const rows = data?.recentBookings || [];
    const needle = bookingSearch.trim().toLowerCase();
    let filtered = rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        row.customerName.toLowerCase().includes(needle) ||
        row.serviceName.toLowerCase().includes(needle) ||
        row.staffName.toLowerCase().includes(needle)
      );
    });
    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'customer') {
        return a.customerName.localeCompare(b.customerName);
      }
      const ad = new Date(a.bookingDate).getTime();
      const bd = new Date(b.bookingDate).getTime();
      return sortBy === 'oldest' ? ad - bd : bd - ad;
    });
    return filtered;
  }, [data?.recentBookings, bookingSearch, statusFilter, sortBy]);

  return (
    <div className="flex h-screen bg-[#f4f6fb] text-slate-900">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Insights
              </p>
              <h1 className="text-2xl font-bold text-slate-900">Shop Analytics</h1>
              <p className="mt-1 text-sm text-slate-500">
                Revenue, bookings, and staff performance for Must Dash
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ShopSelector selectedShopId={selectedShopId} onSelect={setSelectedShopId} />
              <div className="flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                {(['day', 'week', 'month'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRange(r)}
                    className={cn(
                      'rounded-full px-4 py-1.5 text-sm font-medium capitalize transition',
                      range === r
                        ? 'bg-[#111b65] text-white'
                        : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </header>

          {!selectedShopId ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">
              Select a shop to view analytics.
            </div>
          ) : analyticsQuery.isLoading ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">
              Loading analytics…
            </div>
          ) : analyticsQuery.isError || !data ? (
            <div className="rounded-3xl border border-rose-100 bg-rose-50 p-12 text-center text-rose-700">
              {analyticsErrorKind === 'session' ? (
                <div className="space-y-4">
                  <p>Your session expired. Sign in again to view analytics.</p>
                  <button
                    type="button"
                    onClick={() => router.push('/auth/signin')}
                    className="rounded-full bg-[#111b65] px-5 py-2 text-sm font-semibold text-white"
                  >
                    Sign in
                  </button>
                </div>
              ) : analyticsErrorKind === 'forbidden' ? (
                <p>Access denied. You do not have permission to view this shop&apos;s analytics.</p>
              ) : (
                <div className="space-y-4">
                  <p>Could not load analytics. Check your connection and try again.</p>
                  <button
                    type="button"
                    onClick={() => void analyticsQuery.refetch()}
                    className="rounded-full border border-rose-200 bg-white px-5 py-2 text-sm font-semibold text-rose-700"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Total Revenue"
                  value={formatMoney(data.revenue.total)}
                  icon={TrendingUp}
                  accent
                  footer={
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-xs font-semibold',
                        data.revenue.changePercent >= 0 ? 'text-emerald-600' : 'text-rose-600',
                      )}
                    >
                      {data.revenue.changePercent >= 0 ? (
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5" />
                      )}
                      {Math.abs(data.revenue.changePercent)}% vs prior {range}
                    </span>
                  }
                />
                <MetricCard
                  label="Cash"
                  value={formatMoney(data.revenue.cash)}
                  icon={Banknote}
                />
                <MetricCard
                  label="Bank Transfer"
                  value={formatMoney(data.revenue.bankTransfer)}
                  icon={Banknote}
                />
                <MetricCard
                  label="Avg Ticket"
                  value={formatMoney(data.bookings.averageTicket)}
                  icon={CalendarCheck}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
                  <h2 className="text-lg font-semibold text-slate-900">Booking mix</h2>
                  <div className="mt-4 space-y-3">
                    <MixRow label="Paid & checked out" value={data.bookings.paid} total={data.bookings.total} color="bg-[#111b65]" />
                    <MixRow label="Platform (online)" value={data.bookings.platform} total={data.bookings.total} color="bg-indigo-400" />
                    <MixRow label="Walk-in" value={data.bookings.walkIn} total={data.bookings.total} color="bg-amber-400" />
                    <MixRow label="Cancelled" value={data.bookings.cancelled} total={data.bookings.total} color="bg-rose-300" />
                    <MixRow label="No-show" value={data.bookings.noShow} total={data.bookings.total} color="bg-slate-300" />
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
                  <h2 className="text-lg font-semibold text-slate-900">Peak hours</h2>
                  <p className="text-sm text-slate-500">When appointments cluster during the day</p>
                  <div className="mt-6 flex h-40 items-end gap-2">
                    {data.peakHours.length === 0 ? (
                      <p className="text-sm text-slate-400">No booking data for this period.</p>
                    ) : (
                      data.peakHours.map((slot) => (
                        <div key={slot.hour} className="flex flex-1 flex-col items-center gap-1">
                          <div
                            className="w-full rounded-t-lg bg-[#111b65]/80 transition-all"
                            style={{ height: `${Math.max(8, (slot.count / maxPeak) * 100)}%` }}
                            title={`${slot.count} bookings`}
                          />
                          <span className="text-[10px] text-slate-400">
                            {slot.hour % 12 || 12}
                            {slot.hour >= 12 ? 'p' : 'a'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-[#111b65]" />
                      <h2 className="text-lg font-semibold text-slate-900">
                        Best Performance Staff
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => void analyticsQuery.refetch()}
                      className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
                      aria-label="Refresh staff performance"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {data.staffPerformance.length === 0 ? (
                      <p className="text-sm text-slate-400">No paid bookings in this period.</p>
                    ) : (
                      data.staffPerformance.map((staff, index) => {
                        const src = mediaUrl(staff.avatarUrl);
                        const initials = staff.name
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((p) => p[0]?.toUpperCase() || '')
                          .join('');
                        return (
                          <div
                            key={staff.staffId}
                            className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                          >
                            <div className="relative shrink-0">
                              {src ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={src}
                                  alt={staff.name}
                                  className="h-12 w-12 rounded-full object-cover"
                                />
                              ) : (
                                <div
                                  className={cn(
                                    'flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold',
                                    avatarPalette[index % avatarPalette.length],
                                  )}
                                >
                                  {initials || 'S'}
                                </div>
                              )}
                              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold text-slate-900">
                                {staff.name}
                              </p>
                              <p className="truncate text-sm text-slate-500">
                                {staff.role || 'Staff'}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-[#111b65]" />
                    <h2 className="text-lg font-semibold text-slate-900">Top services</h2>
                  </div>
                  <div className="mt-4 space-y-2">
                    {data.topServices.length === 0 ? (
                      <p className="text-sm text-slate-400">No service data yet.</p>
                    ) : (
                      data.topServices.map((svc) => (
                        <div
                          key={svc.name}
                          className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3"
                        >
                          <div>
                            <p className="font-medium text-slate-900">{svc.name}</p>
                            <p className="text-xs text-slate-500">{svc.count} bookings</p>
                          </div>
                          <p className="font-semibold text-slate-700">{formatMoney(svc.revenue)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">Recent Bookings</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={bookingSearch}
                        onChange={(e) => setBookingSearch(e.target.value)}
                        placeholder="Search"
                        className="w-44 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400"
                      />
                    </label>
                    <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                      <Filter className="h-4 w-4" />
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-transparent outline-none"
                      >
                        <option value="all">Filter</option>
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="no-show">No-show</option>
                      </select>
                    </label>
                    <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                      <span>Sort by</span>
                      <select
                        value={sortBy}
                        onChange={(e) =>
                          setSortBy(e.target.value as 'newest' | 'oldest' | 'customer')
                        }
                        className="bg-transparent outline-none"
                      >
                        <option value="newest">Newest</option>
                        <option value="oldest">Oldest</option>
                        <option value="customer">Customer</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500">
                        <th className="px-3 py-3 font-medium">No</th>
                        <th className="px-3 py-3 font-medium">Customer Name</th>
                        <th className="px-3 py-3 font-medium">Services</th>
                        <th className="px-3 py-3 font-medium">Booking Date</th>
                        <th className="px-3 py-3 font-medium">Staff Name</th>
                        <th className="px-3 py-3 font-medium">Status</th>
                        <th className="px-3 py-3 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {recentBookings.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-3 py-10 text-center text-slate-400"
                          >
                            No bookings in this period.
                          </td>
                        </tr>
                      ) : (
                        recentBookings.map((row, index) => (
                          <tr
                            key={row.id}
                            className="border-b border-slate-50 last:border-0"
                          >
                            <td className="px-3 py-3 text-slate-500">{index + 1}</td>
                            <td className="px-3 py-3 font-medium text-slate-900">
                              {row.customerName}
                            </td>
                            <td className="px-3 py-3 text-slate-700">{row.serviceName}</td>
                            <td className="px-3 py-3 text-slate-600">
                              {formatBookingWhen(row.bookingDate)}
                            </td>
                            <td className="px-3 py-3 text-slate-700">{row.staffName}</td>
                            <td className="px-3 py-3">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset capitalize',
                                  statusStyles[row.status] ||
                                    'bg-slate-100 text-slate-600 ring-slate-200',
                                )}
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                {row.status.replace(/_/g, '-')}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right text-slate-400">⋯</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-[28px] border border-[#111b65]/10 bg-[#f1f4ff] p-5 text-sm text-slate-600">
                <div className="flex items-start gap-3">
                  <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-[#111b65]" />
                  <div>
                    <p className="font-semibold text-slate-900">How these numbers are calculated</p>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-slate-600">
                      <li>Revenue counts only paid, checked-out appointments.</li>
                      <li>Platform bookings = online bookings (not marked walk-in).</li>
                      <li>Walk-ins are in-shop appointments created on the scheduler.</li>
                      <li>
                        Staff star scores are relative performance for this period (not customer
                        review ratings).
                      </li>
                      <li>Use End of Day on the home screen for daily cash drawer reconciliation.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  accent = false,
  footer,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        'rounded-[26px] border p-5 shadow-sm',
        accent
          ? 'border-[#111b65]/10 bg-[#111b65] text-white'
          : 'border-slate-200 bg-white text-slate-900',
      )}
    >
      <div className="flex items-center justify-between">
        <p className={cn('text-sm', accent ? 'text-white/70' : 'text-slate-500')}>{label}</p>
        <Icon className={cn('h-4 w-4', accent ? 'text-white/60' : 'text-slate-400')} />
      </div>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      {footer ? <div className="mt-2">{footer}</div> : null}
    </article>
  );
}

function MixRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-900">
          {value} ({pct}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
