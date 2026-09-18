'use client';

import PageShell, { PageHeader } from '@/components/common/PageShell';
import ShopSelector from '@/components/common/ShopSelector';
import { useSelectedShop } from '@/components/common/SelectedShopContext';
import ListToolbar, { fieldClass } from '@/components/dashboard/ListToolbar';
import CategoryCombobox from '@/components/CategoryCombobox';
import { useBusinessServices } from '@/hooks/useBusiness';
import { dashboardService } from '@/services/dashboard.service';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';

type ServiceRecord = {
  _id?: string;
  id?: string;
  name?: string;
  duration?: number;
  basePrice?: number;
  category?: string;
  categoryName?: string;
};

type ServiceForm = {
  name: string;
  categoryName: string;
  duration: string;
  basePrice: string;
};

const emptyForm: ServiceForm = {
  name: '',
  categoryName: '',
  duration: '',
  basePrice: '',
};

export default function ServicesPage() {
  const { selectedShopId, setSelectedShopId } = useSelectedShop();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sortKey, setSortKey] = useState<'name' | 'price' | 'duration'>('name');
  const queryClient = useQueryClient();
  useEffect(() => { setShowModal(false); setEditingId(null); setForm(emptyForm); setCategory('all'); }, [selectedShopId]);

  const { data: servicesRaw, isLoading, error } = useBusinessServices(selectedShopId);

  const services = useMemo(
    () =>
      (Array.isArray(servicesRaw) ? (servicesRaw as ServiceRecord[]) : []).map(
        (service) => ({
          id: String(service._id || service.id || ''),
          name: service.name || 'Service',
          duration: Number(service.duration || 0),
          basePrice: Number(service.basePrice || 0),
          categoryName: service.categoryName || service.category || 'General',
        }),
      ),
    [servicesRaw],
  );

  const categories = useMemo(() => {
    const set = new Set(services.map((s) => s.categoryName).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [services]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let rows = services.filter((s) => {
      if (category !== 'all' && s.categoryName !== category) return false;
      if (!needle) return true;
      return (
        s.name.toLowerCase().includes(needle) ||
        s.categoryName.toLowerCase().includes(needle)
      );
    });
    rows = [...rows].sort((a, b) => {
      if (sortKey === 'price') return b.basePrice - a.basePrice;
      if (sortKey === 'duration') return a.duration - b.duration;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [services, search, category, sortKey]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['business-services', selectedShopId],
    });
  };

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      dashboardService.createService(selectedShopId, payload),
    onSuccess: async () => {
      closeModal();
      await invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Record<string, unknown>;
    }) => dashboardService.updateService(selectedShopId, id, payload),
    onSuccess: async () => {
      closeModal();
      await invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      dashboardService.deleteService(selectedShopId, id),
    onSuccess: invalidate,
  });

  const canSubmit =
    !!selectedShopId &&
    form.name.trim() &&
    form.categoryName.trim() &&
    form.duration &&
    form.basePrice;

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (service: (typeof services)[number]) => {
    setForm({
      name: service.name,
      categoryName: service.categoryName,
      duration: String(service.duration),
      basePrice: String(service.basePrice),
    });
    setEditingId(service.id);
    setShowModal(true);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const payload = {
      name: form.name.trim(),
      categoryName: form.categoryName.trim(),
      duration: Number(form.duration),
      basePrice: Number(form.basePrice),
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(id);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Catalog"
        title="Service Management"
        description="Compact catalog of bookable services — search, filter, edit."
        actions={
          <>
            <ShopSelector
              selectedShopId={selectedShopId}
              onSelect={setSelectedShopId}
            />
            <button
              onClick={() => selectedShopId && openCreate()}
              disabled={!selectedShopId}
              className="flex items-center gap-2 rounded-full bg-[#111b65] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1a2578] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add Service
            </button>
          </>
        }
      />

      {!selectedShopId ? (
        <p className="py-16 text-center text-sm text-slate-500">
          Select a shop first.
        </p>
      ) : isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-11 animate-pulse bg-slate-100" />
          ))}
        </div>
      ) : error ? (
        <p className="py-10 text-center text-sm text-rose-600">
          Error loading services. Please try again.
        </p>
      ) : (
        <div className="space-y-5">
          <ListToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search services…"
            countLabel={`${filtered.length} services`}
            chips={categories.map((c) => ({
              id: c,
              label: c === 'all' ? 'All categories' : c,
            }))}
            activeChip={category}
            onChip={setCategory}
            trailing={
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <span>Sort</span>
                {(
                  [
                    ['name', 'Name'],
                    ['price', 'Price'],
                    ['duration', 'Duration'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSortKey(id)}
                    className={
                      sortKey === id
                        ? 'font-medium text-[#111b65] underline underline-offset-8'
                        : 'hover:text-slate-800'
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
          />

          {services.length === 0 ? (
            <p className="py-14 text-center text-sm text-slate-500">
              No services yet. Use Add Service to create the first one.
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-14 text-center text-sm text-slate-500">
              No services match these filters.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((service) => (
                <li
                  key={service.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-4 py-3 sm:grid-cols-[1.4fr_1fr_auto_auto_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {service.name}
                    </p>
                    <p className="text-xs text-slate-400 sm:hidden">
                      {service.categoryName}
                    </p>
                  </div>
                  <p className="hidden truncate text-sm text-slate-500 sm:block">
                    {service.categoryName}
                  </p>
                  <p className="hidden text-sm tabular-nums text-slate-600 sm:block">
                    {service.duration} min
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-slate-900">
                    {service.basePrice.toFixed(0)} ETB
                  </p>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(service)}
                      className="p-2 text-slate-400 transition hover:text-slate-800"
                      aria-label={`Edit ${service.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(service.id, service.name)}
                      disabled={deleteMutation.isPending}
                      className="p-2 text-slate-400 transition hover:text-rose-600 disabled:opacity-50"
                      aria-label={`Delete ${service.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                  Catalog
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">
                  {editingId ? 'Edit Service' : 'Add Service'}
                </h2>
              </div>
              <button
                onClick={closeModal}
                className="p-2 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  Service name
                </span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((state) => ({ ...state, name: e.target.value }))
                  }
                  placeholder="e.g. Women’s Haircut"
                  className={fieldClass}
                />
              </label>
              <CategoryCombobox
                kind="service"
                businessId={selectedShopId}
                label="Category"
                placeholder="e.g. Haircut"
                value={form.categoryName}
                onChange={(categoryName) =>
                  setForm((state) => ({ ...state, categoryName }))
                }
                inputClassName={fieldClass}
              />
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  Duration (mins)
                </span>
                <input
                  type="number"
                  value={form.duration}
                  onChange={(e) =>
                    setForm((state) => ({ ...state, duration: e.target.value }))
                  }
                  placeholder="45"
                  className={fieldClass}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  Base price (ETB)
                </span>
                <input
                  type="number"
                  value={form.basePrice}
                  onChange={(e) =>
                    setForm((state) => ({ ...state, basePrice: e.target.value }))
                  }
                  placeholder="500"
                  className={fieldClass}
                />
              </label>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit || isSaving}
              className="mt-8 w-full rounded-full bg-[#111b65] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1a2578] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving
                ? 'Saving…'
                : editingId
                  ? 'Save changes'
                  : 'Create service'}
            </button>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
