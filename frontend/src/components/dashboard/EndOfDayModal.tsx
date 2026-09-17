'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';
import { cn } from '@/lib/utils';
import {
  Banknote,
  Building2,
  Printer,
  Smartphone,
  X,
} from 'lucide-react';
import { useRef } from 'react';

type EndOfDayModalProps = {
  open: boolean;
  shopId: string;
  date: string;
  onClose: () => void;
};

const formatMoney = (value: number) =>
  `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

export default function EndOfDayModal({
  open,
  shopId,
  date,
  onClose,
}: EndOfDayModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const reportQuery = useQuery({
    queryKey: ['end-of-day', shopId, date],
    queryFn: () => dashboardService.getEndOfDay(shopId, date),
    enabled: open && !!shopId,
  });

  const report = reportQuery.data;

  const handlePrint = () => {
    window.print();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm print:bg-white print:p-0">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl print:max-h-none print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 print:hidden">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              End of Day
            </p>
            <h2 className="text-xl font-semibold text-slate-900">Daily Close Summary</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={!report}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              Print / PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div ref={printRef} className="overflow-y-auto px-6 py-6 print:overflow-visible">
          {reportQuery.isLoading ? (
            <p className="py-12 text-center text-sm text-slate-500">Preparing close report…</p>
          ) : reportQuery.isError ? (
            <p className="py-12 text-center text-sm text-rose-600">
              Could not load end-of-day report. Ensure bookings are checked out.
            </p>
          ) : report ? (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-5 print:border-slate-300">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Must Dash</p>
                <h3 className="mt-1 text-2xl font-bold text-slate-900">{report.shopName}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {new Date(`${report.date}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Paid &amp; checked-out appointments only · Platform = online bookings (not walk-in)
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <SummaryCard
                  icon={Banknote}
                  label="Cash in Drawer"
                  value={formatMoney(report.cashTotal)}
                  accent="emerald"
                />
                <SummaryCard
                  icon={Building2}
                  label="Bank Transfers"
                  value={formatMoney(report.bankTransferTotal)}
                  accent="sky"
                />
                <SummaryCard
                  icon={Smartphone}
                  label="Platform Bookings"
                  value={formatMoney(report.platformTotal)}
                  sub={`${report.platformCount} booking${report.platformCount === 1 ? '' : 's'}`}
                  accent="indigo"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                  <span className="text-slate-500">Walk-in revenue</span>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {formatMoney(report.walkInTotal)}{' '}
                    <span className="text-sm font-normal text-slate-500">
                      ({report.walkInCount})
                    </span>
                  </p>
                </div>
                <div className="rounded-2xl border border-[#111b65]/10 bg-[#f1f4ff] px-4 py-3 text-sm">
                  <span className="text-slate-500">Grand total</span>
                  <p className="mt-1 text-2xl font-bold text-[#111b65]">
                    {formatMoney(report.grandTotal)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {report.paidBookingsCount} paid appointment
                    {report.paidBookingsCount === 1 ? '' : 's'}
                  </p>
                </div>
              </div>

              {report.transactions.length > 0 ? (
                <div>
                  <h4 className="mb-3 text-sm font-semibold text-slate-900">Transaction log</h4>
                  <div className="overflow-hidden rounded-2xl border border-slate-100">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Time</th>
                          <th className="px-4 py-3">Client</th>
                          <th className="px-4 py-3">Staff</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.transactions.map((tx) => (
                          <tr key={tx.id} className="text-slate-700">
                            <td className="px-4 py-3 whitespace-nowrap">{formatTime(tx.startTime)}</td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">{tx.clientName}</div>
                              <div className="text-xs text-slate-500">{tx.services}</div>
                            </td>
                            <td className="px-4 py-3">{tx.staffName}</td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                                  tx.isWalkIn
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-indigo-100 text-indigo-700',
                                )}
                              >
                                {tx.isWalkIn ? 'Walk-in' : 'Platform'}
                              </span>
                              <span className="ml-1 text-xs text-slate-400">
                                {tx.paymentMethod === 'cash' ? 'Cash' : 'Transfer'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">
                              {formatMoney(tx.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
                  No paid appointments for this date yet.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .fixed.inset-0.z-50,
          .fixed.inset-0.z-50 * {
            visibility: visible;
          }
          .fixed.inset-0.z-50 {
            position: absolute;
            inset: 0;
            background: white !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent: 'emerald' | 'sky' | 'indigo';
}) {
  const accents = {
    emerald: 'border-emerald-100 bg-emerald-50/50 text-emerald-700',
    sky: 'border-sky-100 bg-sky-50/50 text-sky-700',
    indigo: 'border-indigo-100 bg-indigo-50/50 text-indigo-700',
  };

  return (
    <div className={cn('rounded-2xl border p-4', accents[accent])}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 opacity-80" />
        <span className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}
