'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';
import { cn } from '@/lib/utils';
import {
  X,
  Phone,
  Mail,
  CalendarClock,
  Coins,
  History,
  StickyNote,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

type ClientDrawerProps = {
  open: boolean;
  shopId: string;
  clientId: string | null;
  bookingId?: string | null;
  onClose: () => void;
  onCancelBooking?: () => void;
  onCompleteBooking?: () => void;
};

const initials = (name: string): string =>
  name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

const formatRelative = (value?: string): string => {
  if (!value) return '—';
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} yr ago`;
};

const formatShortDate = (value: string): string => {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatTime = (value: string): string => {
  const date = new Date(value);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function ClientDrawer({
  open,
  shopId,
  clientId,
  bookingId,
  onClose,
  onCancelBooking,
  onCompleteBooking,
}: ClientDrawerProps) {
  const queryClient = useQueryClient();
  const [notesDraft, setNotesDraft] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const savedTimerRef = useRef<number | null>(null);

  const historyQuery = useQuery({
    queryKey: ['client-history', shopId, clientId],
    queryFn: () => dashboardService.getClientHistory(shopId, clientId!),
    enabled: open && !!clientId && !!shopId,
  });

  const data = historyQuery.data;

  useEffect(() => {
    if (data?.client) {
      setNotesDraft(data.client.notes || '');
    }
  }, [data?.client?._id]);

  const saveNotesMutation = useMutation({
    mutationFn: (notes: string) =>
      dashboardService.updateClientNotes(shopId, clientId!, notes),
    onMutate: () => {
      setSaveState('saving');
    },
    onSuccess: (result: any) => {
      setSaveState(result?.__offline ? 'idle' : 'saved');
      queryClient.invalidateQueries({ queryKey: ['client-history', shopId, clientId] });
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setSaveState('idle'), 1500);
    },
    onError: () => {
      setSaveState('idle');
    },
  });

  useEffect(() => {
    if (!open || !clientId) return;
    if (data?.client?.notes === notesDraft) return;

    const handle = window.setTimeout(() => {
      saveNotesMutation.mutate(notesDraft);
    }, 600);

    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesDraft]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    };
  }, []);

  const recent = useMemo(() => data?.recentBookings || [], [data]);
  const client = data?.client;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex bg-slate-950/35 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close client details"
        className="flex-1"
        onClick={onClose}
      />
      <aside className="ml-auto flex h-full w-full max-w-[420px] flex-col border-l border-slate-200 bg-white text-slate-900 shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-base font-semibold text-white">
              {client ? initials(client.fullName) : '—'}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Client</p>
              <h3 className="text-lg font-semibold text-slate-900">
                {client?.fullName || (historyQuery.isLoading ? 'Loading…' : 'Unknown')}
              </h3>
              {client?.phoneNumber ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <Phone className="h-3 w-3" />
                  {client.phoneNumber}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-[0.22em] text-slate-400">
                <Coins className="h-3 w-3" /> Spend
              </div>
              <div className="mt-1 text-base font-semibold text-slate-900">
                ${Number(client?.totalSpend || 0).toLocaleString()}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-[0.22em] text-slate-400">
                <CalendarClock className="h-3 w-3" /> Last
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {formatRelative(client?.lastVisit)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-[0.22em] text-slate-400">
                <History className="h-3 w-3" /> Visits
              </div>
              <div className="mt-1 text-base font-semibold text-slate-900">
                {client?.totalVisits ?? 0}
              </div>
            </div>
          </div>

          {client?.email ? (
            <div className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Mail className="h-4 w-4 text-slate-400" />
              <span className="truncate">{client.email}</span>
            </div>
          ) : null}

          <section>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <History className="h-4 w-4 text-slate-500" />
              Recent history
            </h4>

            {historyQuery.isLoading ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                Loading history…
              </div>
            ) : recent.length === 0 ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                No previous visits yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {recent.slice(0, 3).map((booking) => {
                  const isCancelled =
                    booking.status === 'cancelled' || booking.computedStatus === 'cancelled';
                  return (
                    <li
                      key={booking._id}
                      className={cn(
                        'rounded-2xl border px-3 py-3 text-sm transition',
                        isCancelled
                          ? 'border-rose-100 bg-rose-50/60'
                          : 'border-slate-100 bg-white',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {booking.services.map((s) => s.name).filter(Boolean).join(', ') ||
                              'Service'}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {formatShortDate(booking.startTime)} · {formatTime(booking.startTime)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-slate-900">
                            ${Number(booking.totalAmount || 0).toLocaleString()}
                          </div>
                          <div
                            className={cn(
                              'mt-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
                              isCancelled ? 'text-rose-500' : 'text-emerald-600',
                            )}
                          >
                            {booking.computedStatus}
                          </div>
                        </div>
                      </div>
                      {booking.staffName ? (
                        <div className="mt-1 text-[11px] text-slate-400">with {booking.staffName}</div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <StickyNote className="h-4 w-4 text-slate-500" />
                Barber notes
              </h4>
              <span
                className={cn(
                  'text-[11px] font-medium uppercase tracking-[0.18em]',
                  saveState === 'saving' && 'text-slate-400',
                  saveState === 'saved' && 'text-emerald-600',
                  saveState === 'idle' && 'text-slate-300',
                )}
              >
                {saveState === 'saving'
                  ? 'Saving…'
                  : saveState === 'saved'
                    ? 'Saved'
                    : 'Auto-save'}
              </span>
            </div>
            <textarea
              value={notesDraft}
              onChange={(event) => setNotesDraft(event.target.value)}
              placeholder="Preferences, allergies, style notes…"
              className="h-32 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
            />
          </section>
        </div>

        {bookingId ? (
          <footer className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
            {onCancelBooking ? (
              <button
                type="button"
                onClick={onCancelBooking}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
              >
                <XCircle className="h-4 w-4" />
                Cancel
              </button>
            ) : null}
            {onCompleteBooking ? (
              <button
                type="button"
                onClick={onCompleteBooking}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#111b65] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#1a2578]"
              >
                <CheckCircle2 className="h-4 w-4" />
                Checkout
              </button>
            ) : null}
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
