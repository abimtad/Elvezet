'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PaymentMethodId =
  | 'cash'
  | 'cbe'
  | 'cbe_birr'
  | 'telebirr'
  | 'online_other';

export const PAYMENT_METHODS: Array<{ id: PaymentMethodId; label: string; description?: string }> = [
  { id: 'cash', label: 'Cash', description: 'Paid at the counter' },
  { id: 'cbe', label: 'CBE', description: 'Commercial Bank of Ethiopia' },
  { id: 'cbe_birr', label: 'CBE Birr', description: 'CBE mobile wallet' },
  { id: 'telebirr', label: 'Telebirr', description: 'Ethio Telecom mobile money' },
  { id: 'online_other', label: 'Other online', description: 'Other digital payment' },
];

type PaymentMethodPickerProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (method: PaymentMethodId) => void;
};

export default function PaymentMethodPicker({
  open,
  title = 'How was this paid?',
  onClose,
  onSelect,
}: PaymentMethodPickerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method.id}
              type="button"
              onClick={() => onSelect(method.id)}
              className={cn(
                'mb-2 flex w-full flex-col rounded-2xl border border-slate-200 px-4 py-3.5 text-left transition last:mb-0',
                'hover:border-[#111b65] hover:bg-[#f4f6ff]',
              )}
            >
              <span className="text-sm font-semibold text-slate-900">{method.label}</span>
              {method.description ? (
                <span className="mt-0.5 text-xs text-slate-500">{method.description}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
