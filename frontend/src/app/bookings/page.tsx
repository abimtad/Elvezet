'use client';

import PageShell, { PageHeader } from '@/components/common/PageShell';
import ShopSelector from '@/components/common/ShopSelector';
import { useSelectedShop } from '@/components/common/SelectedShopContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';
import { BookingStatus } from '@/types';
import { useState } from 'react';
import { bookingDisplayStatus } from '@/lib/bookingUtils';
import { cn } from '@/lib/utils';
import { Calendar, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

type BookingItem = {
  _id?: string;
  id?: string;
  startTime: string;
  endTime: string;
  status: string;
  computedStatus?: string;
  totalAmount?: number;
  isWalkIn?: boolean;
  clientId?: { fullName?: string; phoneNumber?: string };
  serviceIds?: Array<{ name?: string }>;
  serviceId?: { name?: string };
};

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'border-emerald-200 bg-emerald-50 text-emerald-600',
  pending: 'border-amber-200 bg-amber-50 text-amber-600',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-600',
  completed: 'border-sky-200 bg-sky-50 text-sky-600',
  no_show: 'border-slate-200 bg-slate-100 text-slate-500',
  'no-show': 'border-slate-200 bg-slate-100 text-slate-500',
  expired: 'border-slate-200 bg-slate-100 text-slate-500',
};

const ALL_STATUSES = ['all', 'confirmed', 'pending', 'completed', 'cancelled', 'no_show', 'expired'] as const;

function bookingName(b: BookingItem) {
  return b.clientId?.fullName || (b.isWalkIn ? 'Walk-in' : 'Customer');
}

function bookingService(b: BookingItem) {
  return (b.serviceIds || []).map((s) => s.name).filter(Boolean).join(', ') || b.serviceId?.name || 'Booking';
}

export default function BookingsPage() {
  const { selectedShopId, setSelectedShopId } = useSelectedShop();
  const [statusFilter, setStatusFilter] = useState<typeof ALL_STATUSES[number]>('all');
  const [selectedDate, setSelectedDate] = useState('');
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['bookings-page', selectedShopId, statusFilter, selectedDate, page],
    queryFn: () =>
      dashboardService.getBookingsPage(selectedShopId, {
        status: statusFilter !== 'all' ? statusFilter : undefined,
        date: selectedDate || undefined,
        page,
        limit: 50,
      }),
    enabled: !!selectedShopId,
  });

  const bookings = (data?.bookings || []) as BookingItem[];

  const updateMutation = useMutation({
    mutationFn: ({ bookingId, status }: { bookingId: string; status: string }) =>
      dashboardService.updateBookingStatus(selectedShopId, bookingId, status as BookingStatus),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookings-page', selectedShopId] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ bookingId }: { bookingId: string }) =>
      dashboardService.cancelBooking(selectedShopId, bookingId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookings-page', selectedShopId] });
    },
  });

  return (
    <PageShell>
      <PageHeader
        eyebrow="Schedule"
        title="Bookings"
        description="View and manage all bookings for the selected shop."
        actions={
          <>
            <label className="flex items-center gap-2 rounded-2xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-slate-600">
              <Calendar className="h-4 w-4 text-slate-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => { setSelectedDate(e.target.value); setPage(1); }}
                className="bg-transparent text-sm text-slate-700 outline-none"
              />
            </label>
            <ShopSelector selectedShopId={selectedShopId} onSelect={(id) => { setSelectedShopId(id); setPage(1); }} />
          </>
        }
      />

      {!selectedShopId ? (
        <div className="rounded-[28px] border border-[#eceff3] bg-white p-12 text-center text-slate-500 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          Select a shop to view its bookings.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={statusFilter === s}
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                  statusFilter === s
                    ? 'border-[#d9def8] bg-[#f1f4ff] text-[#111b65]'
                    : 'border-[#e5e7eb] bg-white text-slate-500 hover:text-slate-700',
                )}
              >
                {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-200" />
              ))}
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
              <AlertCircle className="h-4 w-4" />
              Error loading bookings. Please try again.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[28px] border border-[#eceff3] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              {bookings.length === 0 ? (
                <div className="px-5 py-14 text-center text-slate-500">No bookings found for this filter.</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="border-b border-[#eceff3] bg-[#fbfcfd] text-slate-500">
                    <tr>
                      <th className="px-5 py-3.5 text-left font-medium">Customer</th>
                      <th className="px-5 py-3.5 text-left font-medium">Service</th>
                      <th className="px-5 py-3.5 text-left font-medium">Time</th>
                      <th className="px-5 py-3.5 text-left font-medium">Amount</th>
                      <th className="px-5 py-3.5 text-left font-medium">Status</th>
                      <th className="px-5 py-3.5 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef2f7] text-slate-600">
                    {bookings.map((booking) => {
                      const id = String(booking._id || booking.id || '');
                      const displayStatus = bookingDisplayStatus(booking);
                      return (
                        <tr key={id} className="transition hover:bg-[#fafbfd]">
                          <td className="px-5 py-3.5">
                            <div className="font-medium text-slate-900">{bookingName(booking)}</div>
                            {booking.isWalkIn ? <div className="mt-0.5 text-xs text-[#111b65]">Walk-in</div> : null}
                          </td>
                          <td className="px-5 py-3.5 text-slate-500">{bookingService(booking)}</td>
                          <td className="px-5 py-3.5 text-slate-500">
                            {new Date(booking.startTime).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-5 py-3.5 font-semibold text-slate-900">
                            ${Number(booking.totalAmount || 0).toFixed(2)}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold', STATUS_STYLES[displayStatus] || 'border-slate-200 bg-slate-100 text-slate-500')}>
                              {displayStatus.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex justify-end gap-2">
                              {displayStatus === 'confirmed' ? (
                                <>
                                  <button
                                    onClick={() => updateMutation.mutate({ bookingId: id, status: 'completed' })}
                                    className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600"
                                  >
                                    <CheckCircle className="h-3 w-3" /> Complete
                                  </button>
                                  <button
                                    onClick={() => cancelMutation.mutate({ bookingId: id })}
                                    className="flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600"
                                  >
                                    <XCircle className="h-3 w-3" /> Cancel
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {!isLoading && !error && data && data.totalPages > 1 ? (
            <nav aria-label="Bookings pages" className="flex items-center justify-end gap-3 text-sm">
              <button type="button" disabled={isFetching || page <= 1} onClick={() => setPage(page - 1)} className="rounded-full border px-4 py-2 disabled:opacity-40">Previous</button>
              <span>Page {data.page} of {data.totalPages}</span>
              <button type="button" disabled={isFetching || page >= data.totalPages} onClick={() => setPage(page + 1)} className="rounded-full border px-4 py-2 disabled:opacity-40">Next</button>
            </nav>
          ) : null}
        </>
      )}
    </PageShell>
  );
}
