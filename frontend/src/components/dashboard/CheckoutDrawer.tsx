'use client';

import { useState, useEffect } from 'react';
import { MoreHorizontal, Plus, Trash2, X } from 'lucide-react';
import PaymentMethodPicker, { type PaymentMethodId } from '@/components/dashboard/PaymentMethodPicker';

function avatarInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (name || '?').slice(0, 2).toUpperCase();
}

export type CheckoutProduct = {
  _id: string;
  name: string;
  brand?: string;
  price: number;
  stockQuantity?: number;
};

type CheckoutService = {
  _id?: string;
  name?: string;
  basePrice?: number;
  duration?: number;
  categoryName?: string;
  category?: string;
};

export type CheckoutBooking = {
  _id: string;
  startTime: string;
  endTime: string;
  tipAmount?: number;
  clientId?: {
    _id?: string;
    fullName?: string;
    phoneNumber?: string;
  };
  serviceIds?: CheckoutService[];
  staffId?:
    | {
        _id?: string;
        userId?: { fullName?: string };
      }
    | string;
  totalAmount?: number;
};

export type CheckoutPayload = {
  products: Array<{ productId: string; quantity: number }>;
  paymentMethod: PaymentMethodId;
  tip?: number;
};

type CheckoutDrawerProps = {
  open: boolean;
  booking: CheckoutBooking | null;
  products: CheckoutProduct[];
  onClose: () => void;
  onPay: (data: CheckoutPayload) => Promise<void>;
  onSaveUnpaid: () => void;
};

export default function CheckoutDrawer({
  open,
  booking,
  products,
  onClose,
  onPay,
  onSaveUnpaid,
}: CheckoutDrawerProps) {
  const [addedProductIds, setAddedProductIds] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [tipInput, setTipInput] = useState('');
  const [tipBarber, setTipBarber] = useState('');
  const [showTipInput, setShowTipInput] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && booking) {
      setAddedProductIds([]);
      setQuantities({});
      setTipInput(booking.tipAmount ? String(booking.tipAmount) : '');
      setTipBarber('');
      setShowTipInput(false);
      setShowProductPicker(false);
      setShowPaymentPicker(false);
      setSubmitting(false);
    }
  }, [open, booking?._id]);

  if (!open || !booking) return null;

  const clientName = booking.clientId?.fullName || 'Walk-in Guest';
  const clientPhone = booking.clientId?.phoneNumber || '';
  const services = booking.serviceIds || [];
  const staffName =
    typeof booking.staffId === 'object' && booking.staffId
      ? (booking.staffId as { userId?: { fullName?: string } }).userId?.fullName || 'Staff'
      : 'Staff';

  const serviceTotal = services.reduce((sum, s) => sum + Number(s.basePrice || 0), 0);

  const addedProductItems = addedProductIds
    .map((id) => {
      const product = products.find((p) => p._id === id);
      return product ? { product, qty: quantities[id] || 1 } : null;
    })
    .filter((item): item is { product: CheckoutProduct; qty: number } => item !== null);

  const productTotal = addedProductItems.reduce(
    (sum, { product, qty }) => sum + product.price * qty,
    0,
  );

  const tipAmount = parseFloat(tipInput) || 0;
  const netAmount = serviceTotal + productTotal;
  const taxAmount = 0;
  const amountDue = netAmount + taxAmount + tipAmount;

  const availableProducts = products.filter((p) => !addedProductIds.includes(p._id));

  const handleAddProduct = (productId: string) => {
    setAddedProductIds((prev) => [...prev, productId]);
    setQuantities((prev) => ({ ...prev, [productId]: 1 }));
    setShowProductPicker(false);
  };

  const handleRemoveProduct = (productId: string) => {
    setAddedProductIds((prev) => prev.filter((id) => id !== productId));
    setQuantities((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const handlePayWithMethod = async (method: PaymentMethodId) => {
    setShowPaymentPicker(false);
    if (submitting) return;
    setSubmitting(true);
    try {
      await onPay({
        products: addedProductItems.map(({ product, qty }) => ({
          productId: product._id,
          quantity: qty,
        })),
        paymentMethod: method,
        tip: tipAmount > 0 ? tipAmount : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex bg-slate-950/40 backdrop-blur-sm">
        <div className="ml-auto flex h-full w-full max-w-[420px] flex-col bg-white text-slate-900 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="text-lg font-semibold">Checkout</h3>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-50 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#dde4f8] text-sm font-semibold text-[#111b65]">
                  {avatarInitials(clientName)}
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{clientName}</div>
                  {clientPhone ? <div className="text-sm text-slate-500">{clientPhone}</div> : null}
                </div>
              </div>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-2">
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Item</span>
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Amount</span>
            </div>

            {services.map((service) => (
              <div
                key={service._id}
                className="flex items-start justify-between border-b border-slate-100 px-5 py-4"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="font-semibold text-slate-900">{service.name}</div>
                  {(service.categoryName || service.category) ? (
                    <div className="mt-0.5 text-xs text-slate-500">
                      {service.categoryName || service.category}
                    </div>
                  ) : null}
                  <div className="mt-0.5 text-xs text-slate-500">{staffName}</div>
                </div>
                <div className="shrink-0 font-semibold text-slate-900">
                  $ {Number(service.basePrice || 0).toFixed(2)}
                </div>
              </div>
            ))}

            {addedProductItems.map(({ product, qty }) => (
              <div
                key={product._id}
                className="flex items-start justify-between border-b border-slate-100 px-5 py-4"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3 pr-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                    {avatarInitials(product.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900">{product.name}</div>
                    {product.brand ? (
                      <div className="text-xs text-slate-500">{product.brand}</div>
                    ) : null}
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      Qty {qty}
                      <button
                        type="button"
                        onClick={() =>
                          setQuantities((prev) => ({
                            ...prev,
                            [product._id]: Math.max(1, (prev[product._id] || 1) - 1),
                          }))
                        }
                        className="rounded border border-slate-200 px-1.5"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setQuantities((prev) => ({
                            ...prev,
                            [product._id]: (prev[product._id] || 1) + 1,
                          }))
                        }
                        className="rounded border border-slate-200 px-1.5"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold text-slate-900">
                    $ {(product.price * qty).toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveProduct(product._id)}
                    className="text-rose-400 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              {!showProductPicker ? (
                <button
                  type="button"
                  onClick={() => setShowProductPicker(true)}
                  className="flex items-center gap-2 text-sm font-semibold text-[#111b65]"
                >
                  <Plus className="h-4 w-4" />
                  ADD ITEM
                </button>
              ) : (
                <span className="text-sm text-slate-500">Select a product</span>
              )}
              {tipAmount === 0 && !showTipInput ? (
                <button
                  type="button"
                  onClick={() => {
                    setTipBarber(staffName);
                    setShowTipInput(true);
                  }}
                  className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  + ADD TIP
                </button>
              ) : null}
            </div>

            {showProductPicker ? (
              <div className="border-b border-slate-100 px-4 pb-3">
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  {availableProducts.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-400">No products in inventory</p>
                  ) : (
                    availableProducts.map((product) => (
                      <button
                        key={product._id}
                        type="button"
                        onClick={() => handleAddProduct(product._id)}
                        className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
                      >
                        <div>
                          <div className="text-sm font-medium text-slate-900">{product.name}</div>
                          {product.brand ? (
                            <div className="text-xs text-slate-500">{product.brand}</div>
                          ) : null}
                        </div>
                        <span className="text-sm font-semibold">$ {product.price.toFixed(2)}</span>
                      </button>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => setShowProductPicker(false)}
                    className="w-full py-2.5 text-sm text-slate-500 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <div className="border-b border-slate-100 px-5 py-4">
              {tipAmount > 0 ? (
                <div className="mb-3 flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">{tipBarber || staffName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      $ {tipAmount.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setTipInput('');
                        setShowTipInput(false);
                      }}
                      className="text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : null}
              {showTipInput ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    type="number"
                    min="0"
                    value={tipInput}
                    onChange={(e) => setTipInput(e.target.value)}
                    placeholder="Tip amount"
                    className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTipInput(false)}
                    className="rounded-2xl border border-slate-200 px-3 text-sm text-slate-500"
                  >
                    Done
                  </button>
                </div>
              ) : null}
            </div>

            <div className="space-y-2 px-5 py-5">
              <div className="flex justify-between text-sm text-slate-500">
                <span>Net Amount</span>
                <span className="font-medium text-slate-900">$ {netAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-500">
                <span>Taxes</span>
                <span className="font-medium text-slate-900">$ {taxAmount.toFixed(2)}</span>
              </div>
              {tipAmount > 0 ? (
                <div className="flex justify-between text-sm text-slate-500">
                  <span>Tips</span>
                  <span className="font-medium text-slate-900">$ {tipAmount.toFixed(2)}</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-slate-100 pt-3">
                <span className="text-base font-bold text-slate-900">Amount Due</span>
                <span className="text-2xl font-bold text-slate-900">$ {amountDue.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 border-t border-slate-100 px-5 py-4">
            <button
              type="button"
              onClick={onSaveUnpaid}
              className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Save Unpaid
            </button>
            <button
              type="button"
              onClick={() => setShowPaymentPicker(true)}
              disabled={submitting}
              className="flex-1 rounded-2xl bg-[#111b65] py-3.5 text-sm font-semibold text-white hover:bg-[#1a2578] disabled:opacity-50"
            >
              {submitting ? 'Processing…' : 'Pay'}
            </button>
          </div>
        </div>
      </div>

      <PaymentMethodPicker
        open={showPaymentPicker}
        onClose={() => setShowPaymentPicker(false)}
        onSelect={(method) => void handlePayWithMethod(method)}
      />
    </>
  );
}
