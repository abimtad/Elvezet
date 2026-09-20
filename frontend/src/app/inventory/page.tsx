'use client';

import PageShell, { PageHeader } from '@/components/common/PageShell';
import ShopSelector from '@/components/common/ShopSelector';
import { useSelectedShop } from '@/components/common/SelectedShopContext';
import { dashboardService } from '@/services/dashboard.service';
import { useBusinesses } from '@/hooks/useBusiness';
import { Business } from '@/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, AlertTriangle, Pencil, Trash2, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import ListToolbar, { fieldClass } from '@/components/dashboard/ListToolbar';
import CategoryCombobox from '@/components/CategoryCombobox';

const API_ORIGIN = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1'
).replace(/\/api\/v1\/?$/, '');

const mediaUrl = (path?: string) => {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
};

type Product = {
  _id: string;
  name: string;
  brand?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  price: number;
  stockQuantity: number;
  minStockAlert: number;
  isActive?: boolean;
};

type ProductForm = {
  name: string;
  brand: string;
  category: string;
  description: string;
  imageUrl: string;
  price: string;
  stockQuantity: string;
  minStockAlert: string;
};

const emptyForm: ProductForm = {
  name: '',
  brand: '',
  category: '',
  description: '',
  imageUrl: '',
  price: '',
  stockQuantity: '',
  minStockAlert: '',
};

export default function InventoryPage() {
  const { selectedShopId, setSelectedShopId } = useSelectedShop();
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'ok' | 'low' | 'out'>(
    'all',
  );
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [showImageUrlField, setShowImageUrlField] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadGeneration = useRef(0);
  useEffect(() => {
    uploadGeneration.current++;
    setShowModal(false); setEditingId(null); setForm(emptyForm); setUploadingImage(false);
    setCategoryFilter('all'); setUploadError('');
  }, [selectedShopId]);
  const queryClient = useQueryClient();
  const { data: businesses } = useBusinesses();

  const businessList = useMemo(() => {
    return Array.isArray((businesses as any)?.data)
      ? ((businesses as any).data as Business[])
      : ((Array.isArray(businesses) ? businesses : []) as Business[]);
  }, [businesses]);

  const selectedBusiness =
    businessList.find((b) => b.id === selectedShopId || b._id === selectedShopId) ||
    null;
  const productsEnabled = Boolean((selectedBusiness as any)?.productsEnabled);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['inventory-products', selectedShopId],
    queryFn: () => dashboardService.getProducts(selectedShopId),
    enabled: !!selectedShopId,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['inventory-products', selectedShopId] });
  };

  const closeModal = () => {
    uploadGeneration.current++;
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
    setShowImageUrlField(false);
    setUploadingImage(false);
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openCreate = () => {
    if (!productsEnabled) return;
    setForm(emptyForm);
    setEditingId(null);
    setShowImageUrlField(false);
    setUploadError('');
    setShowModal(true);
  };

  const openEdit = (product: Product) => {
    if (!productsEnabled) return;
    const existingUrl = product.imageUrl || '';
    setForm({
      name: product.name,
      brand: product.brand || '',
      category: product.category || '',
      description: product.description || '',
      imageUrl: existingUrl,
      price: String(product.price),
      stockQuantity: String(product.stockQuantity),
      minStockAlert: String(product.minStockAlert),
    });
    setEditingId(product._id);
    setShowImageUrlField(Boolean(existingUrl && /^https?:\/\//i.test(existingUrl)));
    setUploadError('');
    setShowModal(true);
  };

  const handleImageFile = async (file?: File | null) => {
    if (!file || !selectedShopId) return;
    setUploadError('');
    setUploadingImage(true);
    const generation = ++uploadGeneration.current;
    try {
      const result = await dashboardService.uploadProductImage(selectedShopId, file);
      if (generation !== uploadGeneration.current) return;
      const nextUrl = result.imageUrl || result.publicUrl || '';
      setForm((f) => ({ ...f, imageUrl: nextUrl }));
      setShowImageUrlField(false);
    } catch (err: any) {
      if (generation === uploadGeneration.current) setUploadError(err?.response?.data?.message || err?.message || 'Upload failed.');
    } finally {
      if (generation !== uploadGeneration.current) return;
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => dashboardService.createProduct(selectedShopId, data),
    onSuccess: () => {
      invalidate();
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      dashboardService.updateProduct(selectedShopId, id, data),
    onSuccess: () => {
      invalidate();
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dashboardService.deleteProduct(selectedShopId, id),
    onSuccess: invalidate,
  });

  const categories = useMemo(() => {
    const set = new Set(
      products.map((p) => p.category || 'General').filter(Boolean),
    );
    return ['all', ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const needle = search.toLowerCase().trim();
    return products.filter((p) => {
      const category = p.category || 'General';
      if (categoryFilter !== 'all' && category !== categoryFilter) return false;
      const qty = Number(p.stockQuantity || 0);
      const alert = Number(p.minStockAlert || 0);
      const isLow = qty <= alert;
      if (stockFilter === 'out' && qty > 0) return false;
      if (stockFilter === 'low' && (!isLow || qty === 0)) return false;
      if (stockFilter === 'ok' && isLow) return false;
      if (!needle) return true;
      return (
        p.name?.toLowerCase().includes(needle) ||
        p.brand?.toLowerCase().includes(needle) ||
        category.toLowerCase().includes(needle)
      );
    });
  }, [products, search, stockFilter, categoryFilter]);

  const handleSubmit = () => {
    if (!form.name.trim() || !form.price) return;
    const payload = {
      name: form.name.trim(),
      brand: form.brand.trim() || undefined,
      category: form.category.trim() || 'General',
      description: form.description.trim() || '',
      imageUrl: form.imageUrl.trim() || '',
      price: Number(form.price),
      stockQuantity: Number(form.stockQuantity) || 0,
      minStockAlert: form.minStockAlert.trim() === '' ? 5 : Number(form.minStockAlert),
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      addMutation.mutate(payload);
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (!productsEnabled) return;
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(id);
  };

  const isSaving = addMutation.isPending || updateMutation.isPending;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Stock Management"
        title="Inventory"
        description="Manage marketplace products for this shop (CRUD)."
        actions={
          <>
            <ShopSelector selectedShopId={selectedShopId} onSelect={setSelectedShopId} />
            {selectedShopId && productsEnabled ? (
              <button
                onClick={openCreate}
                className="flex items-center gap-2 rounded-full bg-[#111b65] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1a2578]"
              >
                <Plus className="h-4 w-4" />
                Add Product
              </button>
            ) : null}
          </>
        }
      />

      {!selectedShopId ? (
        <p className="py-16 text-center text-sm text-slate-500">
          Select a shop to view its inventory.
        </p>
      ) : !productsEnabled ? (
        <div className="py-12 text-center">
          <p className="text-lg font-semibold text-amber-800">Product selling is off for this shop</p>
          <p className="mt-2 text-sm text-amber-700">
            A super admin must enable “Sell products” on the Tenants page before you can manage the catalog.
          </p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <ListToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search products, brands, or categories…"
            countLabel={`${filtered.length} of ${products.length}`}
            chips={[
              { id: 'all', label: 'All stock' },
              { id: 'ok', label: 'Healthy' },
              { id: 'low', label: 'Low' },
              { id: 'out', label: 'Out' },
            ]}
            activeChip={stockFilter}
            onChip={(id) => setStockFilter(id as typeof stockFilter)}
          />

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-slate-400">Category</span>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter(c)}
                className={cn(
                  'font-medium',
                  categoryFilter === c
                    ? 'text-[#111b65] underline underline-offset-8'
                    : 'text-slate-500 hover:text-slate-800',
                )}
              >
                {c === 'all' ? 'All' : c}
              </button>
            ))}
          </div>

          {products.filter((p) => p.stockQuantity <= p.minStockAlert).length > 0 ? (
            <p className="flex items-center gap-2 text-sm text-rose-600">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {products.filter((p) => p.stockQuantity <= p.minStockAlert).length}{' '}
              product
              {products.filter((p) => p.stockQuantity <= p.minStockAlert).length !== 1
                ? 's'
                : ''}{' '}
              below alert threshold
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-slate-400">
                <tr>
                  <th className="px-1 py-3 text-left font-medium">Product</th>
                  <th className="px-3 py-3 text-left font-medium">Category</th>
                  <th className="px-3 py-3 text-left font-medium">Price</th>
                  <th className="px-3 py-3 text-left font-medium">Stock</th>
                  <th className="px-3 py-3 text-left font-medium">Status</th>
                  <th className="px-1 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-1 py-12 text-center text-slate-500">
                      No products match these filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((product) => {
                    const isLow = product.stockQuantity <= product.minStockAlert;
                    const isOut = product.stockQuantity <= 0;
                    return (
                      <tr key={product._id} className="transition hover:bg-slate-50/80">
                        <td className="px-1 py-3.5">
                          <div className="flex items-center gap-3">
                            <div
                              className="h-9 w-9 flex-shrink-0 rounded-lg bg-slate-100 bg-cover bg-center"
                              style={
                                product.imageUrl
                                  ? { backgroundImage: `url(${mediaUrl(product.imageUrl)})` }
                                  : undefined
                              }
                            />
                            <div>
                              <p className="font-medium text-slate-900">{product.name}</p>
                              <p className="text-xs text-slate-400">{product.brand || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-slate-500">{product.category || '—'}</td>
                        <td className="px-3 py-3.5 tabular-nums">
                          {Number(product.price || 0).toFixed(0)} ETB
                        </td>
                        <td className="px-3 py-3.5">
                          <span
                            className={cn(
                              'font-semibold tabular-nums',
                              isOut || isLow ? 'text-rose-600' : 'text-emerald-600',
                            )}
                          >
                            {product.stockQuantity}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-xs font-medium">
                          {isOut ? (
                            <span className="text-rose-600">Out</span>
                          ) : isLow ? (
                            <span className="text-rose-600">Low</span>
                          ) : (
                            <span className="text-emerald-600">OK</span>
                          )}
                        </td>
                        <td className="px-1 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(product)}
                              className="p-2 text-slate-400 transition hover:text-slate-800"
                              aria-label={`Edit ${product.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(product._id, product.name)}
                              disabled={deleteMutation.isPending}
                              className="p-2 text-slate-400 transition hover:text-rose-600 disabled:opacity-50"
                              aria-label={`Delete ${product.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Inventory</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">
                  {editingId ? 'Edit Product' : 'Add Product'}
                </h2>
              </div>
              <button
                onClick={closeModal}
                className="p-2 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {[
                { label: 'Product Name *', key: 'name', type: 'text', placeholder: 'e.g. Shiseido Perfume' },
                { label: 'Brand', key: 'brand', type: 'text', placeholder: 'e.g. Shiseido' },
              ].map(({ label, key, type, placeholder }) => (
                <label key={key} className="block space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-slate-400">{label}</span>
                  <input
                    type={type}
                    value={form[key as keyof ProductForm]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className={fieldClass}
                  />
                </label>
              ))}
              <CategoryCombobox
                kind="product"
                businessId={selectedShopId}
                label="Category"
                placeholder="e.g. Fragrances"
                value={form.category}
                onChange={(category) => setForm((f) => ({ ...f, category }))}
                inputClassName={fieldClass}
              />
              {[
                { label: 'Price (ETB) *', key: 'price', type: 'number', placeholder: '450' },
                { label: 'Stock Quantity', key: 'stockQuantity', type: 'number', placeholder: '0' },
                { label: 'Low-Stock Alert Threshold', key: 'minStockAlert', type: 'number', placeholder: '5' },
              ].map(({ label, key, type, placeholder }) => (
                <label key={key} className="block space-y-1">
                  <span className="text-xs uppercase tracking-[0.14em] text-slate-400">{label}</span>
                  <input
                    type={type}
                    value={form[key as keyof ProductForm]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className={fieldClass}
                  />
                </label>
              ))}

              <div className="space-y-2">
                <span className="text-xs uppercase tracking-[0.14em] text-slate-400">Product image</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleImageFile(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage || !selectedShopId}
                  className="flex w-full items-center justify-center gap-3 border-b border-dashed border-slate-200 py-6 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900 disabled:opacity-50"
                >
                  {form.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaUrl(form.imageUrl)}
                      alt="Product preview"
                      className="h-14 w-14 rounded-full object-cover"
                    />
                  ) : (
                    <Upload className="h-5 w-5 text-slate-400" />
                  )}
                  <span>{uploadingImage ? 'Uploading…' : 'Upload image'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowImageUrlField((v) => !v)}
                  className="text-sm font-medium text-[#111b65] underline underline-offset-8"
                >
                  Image URL
                </button>
                {showImageUrlField ? (
                  <input
                    type="url"
                    value={form.imageUrl}
                    onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                    placeholder="https://example.com/image.jpg"
                    className={fieldClass}
                  />
                ) : null}
                {uploadError ? (
                  <p className="text-xs text-rose-600">{uploadError}</p>
                ) : null}
              </div>

              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-[0.14em] text-slate-400">Description</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={4}
                  placeholder="Product details for the customer app"
                  className={fieldClass + ' resize-none'}
                />
              </label>
            </div>

            <button
              onClick={handleSubmit}
              disabled={isSaving || !form.name.trim()}
              className="mt-6 w-full bg-[#111b65] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1a2578] disabled:opacity-50"
            >
              {isSaving
                ? editingId
                  ? 'Saving...'
                  : 'Adding...'
                : editingId
                  ? 'Save Changes'
                  : 'Add Product'}
            </button>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
