'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';
import { ArrowLeft, ChevronLeft, ChevronRight, Info, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ClientInfo = {
  _id: string;
  fullName: string;
  phoneNumber: string;
  email?: string;
  notes?: string;
};

export type ServiceInfo = {
  _id: string;
  name: string;
  duration: number;
  basePrice: number;
  category?: string;
  categoryName?: string;
};

type RecentBooking = {
  _id: string;
  services: Array<{ _id: string; name?: string; basePrice?: number }>;
  staffName?: string;
  totalAmount: number;
  startTime: string;
};

export type WalkInSubmitData = {
  selectedClient: ClientInfo | null;
  isAnonymous: boolean;
  newClientName: string;
  newClientPhone: string;
  newClientEmail: string;
  selectedServiceIds: string[];
};

type WalkInDrawerProps = {
  open: boolean;
  shopId: string;
  startMinutes: number;
  services: ServiceInfo[];
  onClose: () => void;
  onSubmit: (data: WalkInSubmitData) => Promise<void>;
};

function minutesToLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function avatarInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (name || '?').slice(0, 2).toUpperCase();
}

export default function WalkInDrawer({
  open,
  shopId,
  startMinutes,
  services,
  onClose,
  onSubmit,
}: WalkInDrawerProps) {
  const [step, setStep] = useState<'client' | 'service'>('client');
  const [clientSearch, setClientSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientInfo | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [newClientMode, setNewClientMode] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [recentPage, setRecentPage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(clientSearch), 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [clientSearch]);

  useEffect(() => {
    if (open) {
      setStep('client');
      setClientSearch('');
      setDebouncedSearch('');
      setSelectedClient(null);
      setIsAnonymous(false);
      setNewClientMode(false);
      setNewClientName('');
      setNewClientPhone('');
      setNewClientEmail('');
      setSelectedServiceIds([]);
      setServiceSearch('');
      setActiveCategory('All');
      setRecentPage(0);
      setSubmitting(false);
      setSubmitError('');
    }
  }, [open]);

  const clientsQuery = useQuery({
    queryKey: ['client-search-drawer', shopId, debouncedSearch],
    queryFn: () => dashboardService.searchClients(shopId, debouncedSearch),
    enabled: open && !!shopId,
  });

  const historyQuery = useQuery({
    queryKey: ['client-history-drawer', shopId, selectedClient?._id],
    queryFn: () => dashboardService.getClientHistory(shopId, selectedClient!._id),
    enabled: !!selectedClient?._id && step === 'service',
  });

  const clientList = useMemo(() => {
    const data = clientsQuery.data as { clients?: ClientInfo[] } | undefined;
    return data?.clients || [];
  }, [clientsQuery.data]);

  const recentBookings = useMemo((): RecentBooking[] => {
    return (historyQuery.data?.recentBookings || []) as RecentBooking[];
  }, [historyQuery.data]);

  const categories = useMemo(() => {
    const cats = new Set<string>(['All']);
    for (const s of services) {
      const cat = s.categoryName || s.category;
      if (cat) cats.add(cat);
    }
    return Array.from(cats);
  }, [services]);

  const filteredServices = useMemo(() => {
    let list = services;
    if (activeCategory !== 'All') {
      list = list.filter((s) => (s.categoryName || s.category || '') === activeCategory);
    }
    if (serviceSearch.trim()) {
      const q = serviceSearch.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    return list;
  }, [services, activeCategory, serviceSearch]);

  const handleClientSelect = (client: ClientInfo) => {
    setSelectedClient(client);
    setIsAnonymous(false);
    setStep('service');
  };

  const handleWalkInAnonymous = () => {
    setSelectedClient(null);
    setIsAnonymous(true);
    setStep('service');
  };

  const handleNewClientProceed = () => {
    if (!newClientName.trim() || newClientPhone.trim().length < 7) return;
    const email = newClientEmail.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setStep('service');
  };

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId],
    );
  };

  const repeatService = (recent: RecentBooking) => {
    const ids = recent.services.map((s) => s._id);
    setSelectedServiceIds((prev) => {
      const newIds = ids.filter((id) => !prev.includes(id));
      return [...prev, ...newIds];
    });
  };

  const handleConfirm = async () => {
    if (selectedServiceIds.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await onSubmit({
        selectedClient,
        isAnonymous,
        newClientName,
        newClientPhone,
        newClientEmail,
        selectedServiceIds,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not create appointment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const displayName =
    selectedClient?.fullName ||
    (newClientMode ? newClientName : null) ||
    (isAnonymous ? 'Walk-in' : '');

  return (
    <div className="fixed inset-0 z-40 flex bg-slate-950/40 backdrop-blur-sm">
      <div className="ml-auto flex h-full w-full max-w-[420px] flex-col bg-white text-slate-900 shadow-2xl">
        {step === 'client' ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Choose A Client</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:text-slate-600"
                >
                  <Info className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="px-4 pt-4 pb-3">
              <div className="relative">
                <input
                  autoFocus
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Search by name, email or telephone"
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-11 text-sm text-slate-800 outline-none focus:border-slate-400"
                />
                <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            {/* Action buttons */}
            {!newClientMode ? (
              <div className="flex gap-3 px-4 pb-4">
                <button
                  type="button"
                  onClick={() => setNewClientMode(true)}
                  className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111b65] text-white">
                    <Plus className="h-5 w-5" />
                  </span>
                  Add new client
                </button>
                <button
                  type="button"
                  onClick={handleWalkInAnonymous}
                  className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl">
                    🙂
                  </span>
                  Walk-in
                </button>
              </div>
            ) : (
              <div className="space-y-2.5 px-4 pb-4">
                <p className="text-xs text-slate-500">
                  Client is saved to this shop when you confirm the booking.
                </p>
                <input
                  autoFocus
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                />
                <input
                  type="tel"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  placeholder="Phone number (required, e.g. +251912345678)"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                />
                <input
                  type="email"
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                  placeholder="Email address (optional)"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewClientMode(false)}
                    className="flex-1 rounded-2xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleNewClientProceed}
                    disabled={
                      !newClientName.trim() ||
                      newClientPhone.trim().length < 7 ||
                      Boolean(
                        newClientEmail.trim() &&
                          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newClientEmail.trim()),
                      )
                    }
                    className="flex-1 rounded-2xl bg-[#111b65] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* Client list */}
            <div className="flex-1 overflow-y-auto px-4 pb-6">
              {clientsQuery.isLoading ? (
                <div className="py-10 text-center text-sm text-slate-400">Loading clients…</div>
              ) : clientList.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">
                  {clientSearch ? 'No clients match your search' : 'No clients yet'}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {clientList.map((client) => (
                    <button
                      key={client._id}
                      type="button"
                      onClick={() => handleClientSelect(client)}
                      className="flex w-full items-center gap-3 py-3.5 text-left transition hover:bg-slate-50 rounded-xl px-1"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dde4f8] text-sm font-semibold text-[#111b65]">
                        {avatarInitials(client.fullName)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{client.fullName || 'Unknown'}</div>
                        <div className="text-xs text-slate-500">{client.phoneNumber}</div>
                        {client.email ? (
                          <div className="text-xs text-slate-400">{client.email}</div>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Service Step Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep('client')}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:text-slate-700"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <h3 className="text-lg font-semibold">Choose A Service</h3>
                  {displayName ? (
                    <p className="text-xs text-slate-500">for {displayName}</p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:text-slate-600"
              >
                <Info className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {selectedServiceIds.length > 0 ? (
                <div className="mx-4 mt-4 rounded-2xl border border-[#111b65]/20 bg-[#f0f3ff] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#111b65]">
                    Selected services ({selectedServiceIds.length})
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {services
                      .filter((s) => selectedServiceIds.includes(s._id))
                      .map((s) => s.name)
                      .join(', ')}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Use + below to add more. Your selection stays when you go back to change the client.
                  </p>
                </div>
              ) : null}

              {/* Recent Appointments */}
              {recentBookings.length > 0 && (
                <div className="px-4 pt-4 pb-2">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">
                      Recent Appointments
                      <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                        {recentBookings.length}
                      </span>
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={recentPage === 0}
                        onClick={() => setRecentPage((p) => Math.max(0, p - 1))}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-400 disabled:opacity-30 hover:border-slate-400"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={recentPage + 2 >= recentBookings.length}
                        onClick={() => setRecentPage((p) => Math.min(recentBookings.length - 2, p + 1))}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-400 disabled:opacity-30 hover:border-slate-400"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    {recentBookings.slice(recentPage, recentPage + 2).map((recent) => (
                      <button
                        key={recent._id}
                        type="button"
                        onClick={() => repeatService(recent)}
                        className="flex-1 rounded-2xl border border-slate-200 bg-white p-3 text-left text-sm transition hover:border-[#111b65] hover:bg-[#f0f3ff]"
                      >
                        <div className="font-semibold text-slate-900 truncate">
                          {recent.services.map((s) => s.name).filter(Boolean).join(', ') || 'Service'}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500 truncate">
                          {recent.staffName || 'Staff'} · ${recent.totalAmount.toFixed(2)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Category pills */}
              <div className="flex items-center gap-2 overflow-x-auto px-4 py-3 scrollbar-hide">
                <button
                  type="button"
                  className="shrink-0 rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-500 hover:border-slate-400"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
                  </svg>
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      'shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition',
                      activeCategory === cat
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-400',
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Service search */}
              <div className="px-4 pb-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={serviceSearch}
                    onChange={(e) => setServiceSearch(e.target.value)}
                    placeholder="Search services"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-700 outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              {/* Service list */}
              <div className="px-4 pb-2">
                {filteredServices.map((service) => {
                  const selected = selectedServiceIds.includes(service._id);
                  return (
                    <div
                      key={service._id}
                      className={cn(
                        'flex items-center justify-between border-b border-slate-100 py-4 transition last:border-b-0',
                        selected && 'bg-slate-50 -mx-2 px-2 rounded-xl',
                      )}
                    >
                      <div className="min-w-0 flex-1 mr-3">
                        {selected && (
                          <div className="mb-1 h-0.5 w-10 rounded bg-rose-500" />
                        )}
                        <div className={cn('text-sm font-semibold truncate', selected ? 'text-[#111b65]' : 'text-slate-900')}>
                          {service.name}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {service.duration} mins | ${service.basePrice.toFixed(2)}
                        </div>
                        {service.categoryName && (
                          <div className="mt-0.5 text-xs text-slate-400">{service.categoryName}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleService(service._id)}
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition',
                          selected
                            ? 'border-[#111b65] bg-[#111b65] text-white'
                            : 'border-slate-300 bg-white text-slate-500 hover:border-slate-500',
                        )}
                      >
                        {selected ? '✓' : '+'}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="px-4 py-3 text-center text-xs text-slate-500">
                Starts at{' '}
                <span className="font-semibold text-slate-800">{minutesToLabel(startMinutes)}</span>
                {selectedServiceIds.length > 0
                  ? ` · ${selectedServiceIds.length} selected`
                  : ''}
              </div>
            </div>

            <div className="border-t border-slate-100 px-4 py-4">
              {submitError ? (
                <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{submitError}</p>
              ) : null}
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={selectedServiceIds.length === 0 || submitting}
                className="w-full rounded-2xl bg-[#111b65] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#1a2578] disabled:opacity-50"
              >
                {submitting
                  ? 'Creating…'
                  : isAnonymous
                    ? 'Confirm Walk-in'
                    : `Book for ${selectedClient?.fullName || newClientName || 'Client'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
