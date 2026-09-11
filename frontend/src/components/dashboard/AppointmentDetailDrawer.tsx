'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import ServicePickerList, { type PickerService } from '@/components/dashboard/ServicePickerList';
import { extractServiceIdsFromBooking } from '@/lib/bookingUtils';
import { cn } from '@/lib/utils';
import BookingConversation from './BookingConversation';

function minutesToLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function toMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function avatarInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (name || '?').slice(0, 2).toUpperCase();
}

function formatDisplayDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' });
}

export type DetailBooking = {
  _id: string;
  startTime: string;
  endTime: string;
  isWalkIn?: boolean;
  paymentStatus?: string;
  paymentMethod?: string;
  paymentVerificationStatus?: string;
  paymentScreenshotUrl?: string;
  totalAmount?: number;
  appointmentNotes?: string;
  tipAmount?: number;
  clientId?: {
    _id?: string;
    fullName?: string;
    phoneNumber?: string;
  };
  serviceIds?: Array<{
    _id?: string;
    name?: string;
    basePrice?: number;
    duration?: number;
    categoryName?: string;
    category?: string;
  }>;
  staffId?:
    | {
        _id?: string;
        userId?: {
          fullName?: string;
          firebaseUid?: string;
        };
      }
    | string;
};

export type AppointmentSavePayload = {
  appointmentNotes: string;
  serviceIds: string[];
  tipAmount: number;
};

type AppointmentDetailDrawerProps = {
  open: boolean;
  booking: DetailBooking | null;
  services: PickerService[];
  saving?: boolean;
  onClose: () => void;
  onSave: (payload: AppointmentSavePayload) => Promise<void>;
  onCheckout: (payload: AppointmentSavePayload) => Promise<void>;
  onCancel?: (bookingId: string) => Promise<void>;
};

export default function AppointmentDetailDrawer({
  open,
  booking,
  services,
  saving = false,
  onClose,
  onSave,
  onCheckout,
  onCancel,
}: AppointmentDetailDrawerProps) {
  const [notes, setNotes] = useState('');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [tipInput, setTipInput] = useState('');
  const [showTipInput, setShowTipInput] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [tipSaving, setTipSaving] = useState(false);
  const lastSavedTipRef = useRef(0);

  useEffect(() => {
    if (!open || !booking) return;
    setNotes(booking.appointmentNotes || '');
    setSelectedServiceIds(extractServiceIdsFromBooking(booking));
    const tip = booking.tipAmount ? Number(booking.tipAmount) : 0;
    setTipInput(tip > 0 ? String(tip) : '');
    lastSavedTipRef.current = tip;
    setShowServicePicker(false);
    setShowTipInput(tip <= 0);
    setCancelling(false);
  }, [open, booking?._id]);

  const selectedServices = useMemo(
    () => services.filter((s) => selectedServiceIds.includes(s._id)),
    [services, selectedServiceIds],
  );

  if (!open || !booking) return null;

  const clientName = booking.clientId?.fullName || 'Walk-in Guest';
  const clientPhone = booking.clientId?.phoneNumber || '';
  const isFinished = booking.paymentStatus === 'paid';
  const staffName =
    typeof booking.staffId === 'object' && booking.staffId
      ? booking.staffId.userId?.fullName || 'Staff'
      : 'Staff';

  const serviceTotal = selectedServices.reduce((sum, s) => sum + s.basePrice, 0);
  const tipAmount = parseFloat(tipInput) || 0;
  const totalDurationMins = selectedServices.reduce((sum, s) => sum + s.duration, 0);
  const startMinutes = toMinutes(booking.startTime);
  const dateLabel = formatDisplayDate(booking.startTime);

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId],
    );
  };

  const removeService = (serviceId: string) => {
    setSelectedServiceIds((prev) => prev.filter((id) => id !== serviceId));
  };

  const buildPayload = (): AppointmentSavePayload => ({
    appointmentNotes: notes,
    serviceIds: selectedServiceIds,
    tipAmount,
  });

  const handleSave = async () => {
    if (selectedServiceIds.length === 0) return;
    await onSave(buildPayload());
  };

  const saveTip = async () => {
    if (isFinished || selectedServiceIds.length === 0) return;
    const tipAmount = parseFloat(tipInput) || 0;
    if (tipAmount === lastSavedTipRef.current) return;
    setTipSaving(true);
    try {
      await onSave(buildPayload());
      lastSavedTipRef.current = tipAmount;
      if (tipAmount > 0) setShowTipInput(false);
    } finally {
      setTipSaving(false);
    }
  };

  const handleCancelAppointment = async () => {
    if (!onCancel || cancelling) return;
    setCancelling(true);
    try {
      await onCancel(booking._id);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex bg-slate-950/40 backdrop-blur-sm">
      <div className="ml-auto flex h-full w-full max-w-[420px] flex-col bg-white text-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-semibold">Appointment</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#dde4f8] text-sm font-semibold text-[#111b65]">
              {avatarInitials(clientName)}
            </div>
            <div>
              <div className="font-semibold text-slate-900">{clientName}</div>
              {clientPhone ? <div className="text-sm text-slate-500">{clientPhone}</div> : null}
            </div>
          </div>

          <div className="mt-5 flex items-start justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">{dateLabel}</div>
              <div className="mt-0.5 text-xs text-slate-500">{minutesToLabel(startMinutes)}</div>
            </div>
            {booking.isWalkIn ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                Walk-in
              </span>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Amount due</span>
              <span className="font-semibold">
                ETB {Number(booking.totalAmount || serviceTotal || 0).toFixed(0)}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span className="text-slate-500">Payment</span>
              <span className="font-medium">
                {booking.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span className="text-slate-500">Verification</span>
              <span className="font-medium">
                {booking.paymentVerificationStatus &&
                booking.paymentVerificationStatus !== 'none'
                  ? booking.paymentVerificationStatus
                  : booking.paymentScreenshotUrl
                    ? 'receipt on file'
                    : 'none'}
              </span>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {selectedServices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-400">
                No services yet — add one below
              </div>
            ) : (
              selectedServices.map((service) => (
                <div
                  key={service._id}
                  className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="h-0.5 w-8 shrink-0 rounded bg-rose-500" />
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {service.name}
                          <span className="ml-2 font-normal text-slate-500">
                            | ${service.basePrice.toFixed(2)}
                          </span>
                        </span>
                      </div>
                      {(service.categoryName || service.category) && (
                        <div className="mt-1 pl-10 text-xs text-slate-400">
                          {service.categoryName || service.category}
                        </div>
                      )}
                      <div className="mt-0.5 pl-10 text-xs text-slate-500">{staffName}</div>
                      <div className="mt-0.5 pl-10 text-xs text-slate-400">
                        {service.duration} mins blocked
                      </div>
                    </div>
                    {!isFinished ? (
                      <button
                        type="button"
                        onClick={() => removeService(service._id)}
                        className="shrink-0 text-slate-400 hover:text-rose-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>

          {!isFinished ? (
            <div className="mt-4">
              {!showServicePicker ? (
                <button
                  type="button"
                  onClick={() => setShowServicePicker(true)}
                  className="text-sm font-semibold text-[#111b65] hover:underline underline-offset-2"
                >
                  + Add Service
                </button>
              ) : (
                <div className="space-y-2">
                  <ServicePickerList
                    services={services}
                    selectedIds={selectedServiceIds}
                    onToggle={toggleService}
                  />
                  <button
                    type="button"
                    onClick={() => setShowServicePicker(false)}
                    className="text-sm text-slate-500 hover:text-slate-700"
                  >
                    Done adding services
                  </button>
                </div>
              )}
            </div>
          ) : null}

          <BookingConversation key={booking._id} bookingId={booking._id} />
          <div className="mt-5">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              Appointment notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isFinished}
              placeholder="Allergies, preferences, reminders…"
              rows={3}
              className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400 disabled:opacity-60"
            />
          </div>

          {!isFinished ? (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="mb-2 text-sm font-semibold text-slate-900">Tip</div>
              {tipAmount > 0 && !showTipInput ? (
                <div className="mb-2 flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <span className="text-sm text-slate-700">{staffName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      ${tipAmount.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTipInput('')}
                      className="text-rose-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : null}
              {showTipInput || tipAmount === 0 ? (
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    value={tipInput}
                    onChange={(e) => setTipInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void saveTip();
                      }
                    }}
                    onBlur={() => void saveTip()}
                    placeholder="Tip amount"
                    className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => void saveTip()}
                    disabled={tipSaving}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#111b65] text-white disabled:opacity-50"
                    aria-label="Save tip"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
              {tipSaving ? (
                <p className="mt-1 text-xs text-slate-400">Saving tip…</p>
              ) : null}
              {tipAmount === 0 && !showTipInput ? (
                <button
                  type="button"
                  onClick={() => setShowTipInput(true)}
                  className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#111b65]"
                >
                  <Plus className="h-4 w-4" />
                  ADD TIP
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-100 px-5 py-4">
          <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
            <span>
              Total:{' '}
              <span className="font-semibold text-slate-900">
                ${(serviceTotal + tipAmount).toFixed(2)}
              </span>
            </span>
            {totalDurationMins > 0 ? (
              <span>
                ({Math.floor(totalDurationMins / 60)}h {totalDurationMins % 60}m)
              </span>
            ) : null}
          </div>

          {isFinished ? (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl bg-[#111b65] py-3 text-sm font-semibold text-white"
            >
              Done
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || selectedServiceIds.length === 0}
                className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save for later'}
              </button>
              <button
                type="button"
                onClick={() => void onCheckout(buildPayload())}
                disabled={saving || selectedServiceIds.length === 0}
                className={cn(
                  'flex-1 rounded-2xl py-3 text-sm font-semibold text-white transition',
                  'bg-[#111b65] hover:bg-[#1a2578] disabled:opacity-50',
                )}
              >
                Checkout
              </button>
            </div>
          )}

          {onCancel && !isFinished ? (
            <button
              type="button"
              onClick={() => void handleCancelAppointment()}
              disabled={cancelling}
              className="mt-3 w-full text-center text-sm font-medium text-rose-500 hover:text-rose-600 disabled:opacity-50"
            >
              {cancelling ? 'Cancelling…' : 'Cancel appointment'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
