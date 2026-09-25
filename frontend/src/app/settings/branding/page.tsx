'use client';

import PageShell, { PageHeader } from '@/components/common/PageShell';
import ShopSelector from '@/components/common/ShopSelector';
import { useSelectedShop } from '@/components/common/SelectedShopContext';
import {
  extractTikTokVideoId,
  isInstagramUrl,
  isTikTokUrl,
  normalizeSocialUrl,
} from '@/lib/socialUrls';
import { cn } from '@/lib/utils';
import { businessService } from '@/services/business.service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ImageIcon,
  Link2,
  Play,
  Plus,
  Share2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

const MAX_TIKTOK_LINKS = 5;

const WEEK_DAYS = [
  { dayOfWeek: 1, label: 'Monday' },
  { dayOfWeek: 2, label: 'Tuesday' },
  { dayOfWeek: 3, label: 'Wednesday' },
  { dayOfWeek: 4, label: 'Thursday' },
  { dayOfWeek: 5, label: 'Friday' },
  { dayOfWeek: 6, label: 'Saturday' },
  { dayOfWeek: 0, label: 'Sunday' },
];

type WeeklyScheduleFormRow = {
  dayOfWeek: number;
  isOpen: boolean;
  openingTime: string;
  closingTime: string;
};

type BrandingForm = {
  description: string;
  genderTarget: string;
  openingTime: string;
  closingTime: string;
  weeklySchedule: WeeklyScheduleFormRow[];
  instagramUrl: string;
  tiktokUrls: string[];
};

const defaultWeeklySchedule = (
  openingTime = '09:00',
  closingTime = '18:00',
): WeeklyScheduleFormRow[] =>
  WEEK_DAYS.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    isOpen: day.dayOfWeek !== 0,
    openingTime,
    closingTime,
  }));

const normalizeWeeklySchedule = (
  weeklySchedule:
    | Array<{
        dayOfWeek: number;
        isOpen?: boolean;
        isClosed?: boolean;
        openingTime?: string;
        closingTime?: string;
      }>
    | undefined,
  openingTime: string,
  closingTime: string,
): WeeklyScheduleFormRow[] => {
  const byDay = new Map(
    (weeklySchedule || []).map((entry) => [Number(entry.dayOfWeek), entry]),
  );

  return WEEK_DAYS.map((day) => {
    const entry = byDay.get(day.dayOfWeek);
    const isOpen = entry
      ? entry.isOpen !== undefined
        ? Boolean(entry.isOpen)
        : !entry.isClosed
      : day.dayOfWeek !== 0;

    return {
      dayOfWeek: day.dayOfWeek,
      isOpen,
      openingTime: entry?.openingTime || openingTime,
      closingTime: entry?.closingTime || closingTime,
    };
  });
};

const emptyForm: BrandingForm = {
  description: '',
  genderTarget: '',
  openingTime: '09:00',
  closingTime: '18:00',
  weeklySchedule: defaultWeeklySchedule(),
  instagramUrl: '',
  tiktokUrls: [''],
};

export default function BrandingSettingsPage() {
  const { selectedShopId, setSelectedShopId } = useSelectedShop();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BrandingForm>(emptyForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const businessQuery = useQuery({
    queryKey: ['business-detail', selectedShopId],
    queryFn: () => businessService.getBusiness(selectedShopId),
    enabled: Boolean(selectedShopId),
  });

  useEffect(() => {
    const business = businessQuery.data;
    if (!business) return;
    const openingTime = business.openingTime || '09:00';
    const closingTime = business.closingTime || '18:00';
    setForm({
      description: business.description || '',
      genderTarget: ['male', 'female', 'all'].includes(business.genderTarget || '')
        ? (business.genderTarget as string)
        : '',
      openingTime,
      closingTime,
      weeklySchedule: normalizeWeeklySchedule(
        business.weeklySchedule,
        openingTime,
        closingTime,
      ),
      instagramUrl: business.instagramUrl || '',
      tiktokUrls: business.tiktokUrls?.length ? business.tiktokUrls : [''],
    });
  }, [businessQuery.data]);

  const business = businessQuery.data;
  const logoUrl = business?.logoUrl || '';
  const coverImageUrl = business?.coverImageUrl || '';
  const galleryUrls = business?.galleryUrls?.filter((url) => url.trim()) || [];

  const saveMutation = useMutation({
    mutationFn: () => {
      const tiktokUrls = form.tiktokUrls.map(normalizeSocialUrl).filter(Boolean);
      const instagramUrl = form.instagramUrl.trim()
        ? normalizeSocialUrl(form.instagramUrl)
        : '';

      if (instagramUrl && !isInstagramUrl(instagramUrl)) {
        throw new Error('Instagram link must be a valid instagram.com URL.');
      }
      for (const url of tiktokUrls) {
        if (!isTikTokUrl(url)) {
          throw new Error('Each TikTok link must be a valid tiktok.com URL.');
        }
      }

      const genderTarget = form.genderTarget;
      if (genderTarget !== 'male' && genderTarget !== 'female' && genderTarget !== 'all') {
        throw new Error('Choose who you serve: Men, Women, or Everyone.');
      }

      return businessService.updateBusiness(selectedShopId, {
        description: form.description.trim() || undefined,
        genderTarget,
        openingTime: form.openingTime,
        closingTime: form.closingTime,
        weeklySchedule: form.weeklySchedule.map((row) => ({
          dayOfWeek: row.dayOfWeek,
          isOpen: row.isOpen,
          openingTime: row.isOpen ? row.openingTime : undefined,
          closingTime: row.isOpen ? row.closingTime : undefined,
        })),
        instagramUrl: instagramUrl || undefined,
        tiktokUrls,
      });
    },
    onSuccess: () => {
      setMessage('Profile settings saved. Mobile app will reflect these changes on next load.');
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['business-detail', selectedShopId] });
      void queryClient.invalidateQueries({ queryKey: ['businesses'] });
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to save branding.');
      setMessage('');
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (payload: { kind: 'logo' | 'cover' | 'gallery'; files: File[] }) => {
      if (!selectedShopId) throw new Error('Select a shop first.');
      if (!payload.files.length) throw new Error('Choose at least one image.');

      if (payload.kind === 'logo') {
        return businessService.uploadBusinessLogo(selectedShopId, payload.files[0]);
      }
      if (payload.kind === 'cover') {
        return businessService.uploadBusinessCover(selectedShopId, payload.files[0]);
      }
      return businessService.uploadBusinessGallery(selectedShopId, payload.files);
    },
    onSuccess: async () => {
      setError('');
      setMessage('Image uploaded successfully.');
      await queryClient.invalidateQueries({ queryKey: ['business-detail', selectedShopId] });
    },
    onError: (err: Error) => {
      setMessage('');
      setError(err.message || 'Failed to upload image.');
    },
  });

  const validTikTokPreviews = useMemo(
    () =>
      form.tiktokUrls
        .map((url) => normalizeSocialUrl(url))
        .filter((url) => url && isTikTokUrl(url)),
    [form.tiktokUrls],
  );

  const updateTikTok = (index: number, value: string) => {
    setForm((state) => {
      const next = [...state.tiktokUrls];
      next[index] = value;
      return { ...state, tiktokUrls: next };
    });
  };

  const addTikTokField = () => {
    if (form.tiktokUrls.length >= MAX_TIKTOK_LINKS) return;
    setForm((state) => ({ ...state, tiktokUrls: [...state.tiktokUrls, ''] }));
  };

  const removeTikTokField = (index: number) => {
    setForm((state) => ({
      ...state,
      tiktokUrls: state.tiktokUrls.filter((_, i) => i !== index),
    }));
  };

  const updateMasterTime = (key: 'openingTime' | 'closingTime', value: string) => {
    setForm((state) => ({
      ...state,
      [key]: value,
      weeklySchedule: state.weeklySchedule.map((row) => ({
        ...row,
        [key]: value,
      })),
    }));
  };

  const updateScheduleRow = (
    dayOfWeek: number,
    patch: Partial<WeeklyScheduleFormRow>,
  ) => {
    setForm((state) => ({
      ...state,
      weeklySchedule: state.weeklySchedule.map((row) =>
        row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row,
      ),
    }));
  };

  const uploadOne =
    (kind: 'logo' | 'cover') =>
    async (fileList: FileList | null) => {
      const file = fileList?.[0];
      if (!file) return;
      await uploadMutation.mutateAsync({ kind, files: [file] });
    };

  const uploadGallery = async (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : [];
    if (!files.length) return;
    await uploadMutation.mutateAsync({ kind: 'gallery', files });
  };

  const removeGalleryImage = async (index: number) => {
    if (!selectedShopId) return;
    await businessService.deleteBusinessGalleryImage(selectedShopId, index);
    await queryClient.invalidateQueries({ queryKey: ['business-detail', selectedShopId] });
    setMessage('Gallery image removed.');
    setError('');
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Settings"
        title="Social & Media Branding"
        description="Control how your shop appears in the Must Dash customer app — logo, cover, TikTok reels, and Instagram."
        actions={
          <>
            <Link
              href="/settings"
              className="rounded-full border border-[#e5e7eb] px-4 py-2 text-sm font-medium text-slate-600 hover:bg-[#f8f9fa]"
            >
              Back
            </Link>
            <ShopSelector selectedShopId={selectedShopId} onSelect={setSelectedShopId} />
          </>
        }
      />

      {!selectedShopId ? (
        <div className="rounded-[28px] border border-[#eceff3] bg-white p-12 text-center text-slate-500 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          Select a shop to manage branding.
        </div>
      ) : businessQuery.isLoading ? (
        <div className="h-64 animate-pulse rounded-[28px] bg-slate-200" />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-6">
            <article className="rounded-[28px] border border-[#eceff3] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              <h2 className="text-lg font-semibold text-slate-900">Shop Identity</h2>
              <p className="mt-1 text-sm text-slate-500">
                Upload the logo and cover image directly. The customer app reads these live.
              </p>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <label className="group block">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => void uploadOne('logo')(event.target.files)}
                  />
                  <div
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      void uploadOne('logo')(event.dataTransfer.files);
                    }}
                    className="flex min-h-56 cursor-pointer flex-col justify-between rounded-[24px] border border-dashed border-[#d9dee8] bg-[#fbfcff] p-5 transition hover:border-[#b6c0ff] hover:bg-[#f6f8ff]"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <ImageIcon className="h-4 w-4" />
                          Shop Logo
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm">
                          Square
                        </span>
                      </div>
                      <div
                        className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-[20px] border border-[#eceff3] bg-white"
                        style={{
                          backgroundImage: logoUrl ? `url(${logoUrl})` : undefined,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }}
                      >
                        {!logoUrl ? (
                          <div className="text-center">
                            <Upload className="mx-auto h-7 w-7 text-slate-400" />
                            <p className="mt-2 text-sm font-medium text-slate-900">Drop or click to upload</p>
                            <p className="mt-1 text-xs text-slate-500">PNG, JPG, WEBP, GIF, AVIF</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                      <span>{logoUrl ? 'Replace logo' : 'Choose a logo file'}</span>
                      <span className="font-semibold text-[#111b65]">Upload</span>
                    </div>
                  </div>
                </label>

                <label className="group block">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => void uploadOne('cover')(event.target.files)}
                  />
                  <div
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      void uploadOne('cover')(event.dataTransfer.files);
                    }}
                    className="flex min-h-56 cursor-pointer flex-col justify-between rounded-[24px] border border-dashed border-[#d9dee8] bg-[#fbfcff] p-5 transition hover:border-[#b6c0ff] hover:bg-[#f6f8ff]"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <ImageIcon className="h-4 w-4" />
                          Cover Image
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm">
                          Wide
                        </span>
                      </div>
                      <div
                        className="h-36 w-full overflow-hidden rounded-[20px] border border-[#eceff3] bg-white"
                        style={{
                          backgroundImage: coverImageUrl
                            ? `url(${coverImageUrl})`
                            : 'linear-gradient(135deg, #111b65, #4f46e5)',
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }}
                      >
                        {!coverImageUrl ? (
                          <div className="flex h-full items-center justify-center text-center text-white">
                            <div>
                              <Upload className="mx-auto h-7 w-7 text-white/90" />
                              <p className="mt-2 text-sm font-medium">Drop or click to upload</p>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                      <span>{coverImageUrl ? 'Replace cover' : 'Choose a cover image'}</span>
                      <span className="font-semibold text-[#111b65]">Upload</span>
                    </div>
                  </div>
                </label>
              </div>
            </article>

            <article className="rounded-[28px] border border-[#eceff3] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              <h2 className="text-lg font-semibold text-slate-900">Gallery</h2>
              <p className="mt-1 text-sm text-slate-500">
                Add multiple photos at once. Customers see these on the shop profile.
              </p>

              <div
                className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void uploadGallery(event.dataTransfer.files);
                }}
              >
                {galleryUrls.map((url, index) => (
                  <div
                    key={`${url}-${index}`}
                    className="group relative aspect-square overflow-hidden rounded-[20px] border border-[#eceff3] bg-[#f8f9fa]"
                    style={{
                      backgroundImage: `url(${url})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => void removeGalleryImage(index)}
                      className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white opacity-100 transition hover:bg-black"
                      aria-label="Remove gallery image"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                <label className="group flex aspect-square cursor-pointer flex-col items-center justify-center rounded-[20px] border border-dashed border-[#d9dee8] bg-[#fbfcff] text-center transition hover:border-[#b6c0ff] hover:bg-[#f6f8ff]">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => void uploadGallery(event.target.files)}
                  />
                  <Plus className="h-6 w-6 text-[#111b65]" />
                  <span className="mt-2 text-sm font-semibold text-slate-900">Add Images</span>
                  <span className="mt-1 text-xs text-slate-500">Drag files or click</span>
                </label>
              </div>
            </article>

            <article className="rounded-[28px] border border-[#eceff3] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              <h2 className="text-lg font-semibold text-slate-900">Social Media & Branding</h2>
              <p className="mt-1 text-sm text-slate-500">
                Edit the public profile, master operating hours, and social links.
              </p>

              <label className="mt-5 block">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  About / Biography
                </span>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, description: e.target.value }))
                  }
                  rows={5}
                  placeholder="Tell customers about your shop, specialties, and atmosphere."
                  className="w-full resize-none rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none focus:border-slate-400"
                />
              </label>

              <fieldset className="mt-5">
                <legend className="mb-2 text-sm font-medium text-slate-700">
                  Who do you serve?
                </legend>
                <p className="mb-3 text-xs text-slate-500">
                  Customers this business serves — not the owner&apos;s gender.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      ['male', 'Men'],
                      ['female', 'Women'],
                      ['all', 'Everyone'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() =>
                        setForm((s) => ({ ...s, genderTarget: id }))
                      }
                      className={cn(
                        'rounded-2xl border px-3 py-3 text-sm font-medium transition',
                        form.genderTarget === id
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-[#e5e7eb] bg-white text-slate-700 hover:border-slate-300',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {!['male', 'female', 'all'].includes(form.genderTarget) ? (
                  <p className="mt-2 text-sm text-amber-700">
                    Choose Men, Women, or Everyone.
                  </p>
                ) : null}
              </fieldset>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">
                    Opening Time
                  </span>
                  <input
                    type="time"
                    value={form.openingTime}
                    onChange={(e) => updateMasterTime('openingTime', e.target.value)}
                    className="w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none focus:border-slate-400"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">
                    Closing Time
                  </span>
                  <input
                    type="time"
                    value={form.closingTime}
                    onChange={(e) => updateMasterTime('closingTime', e.target.value)}
                    className="w-full rounded-2xl border border-[#e5e7eb] px-4 py-3 text-sm outline-none focus:border-slate-400"
                  />
                </label>
              </div>

              <div className="mt-5 rounded-2xl border border-[#eceff3] bg-[#fbfcff] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Weekly customer schedule
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      These days are shown in the customer app. Times must stay
                      inside the master opening and closing range above.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {WEEK_DAYS.map((day) => {
                    const row =
                      form.weeklySchedule.find(
                        (item) => item.dayOfWeek === day.dayOfWeek,
                      ) || {
                        dayOfWeek: day.dayOfWeek,
                        isOpen: false,
                        openingTime: form.openingTime,
                        closingTime: form.closingTime,
                      };

                    return (
                      <div
                        key={day.dayOfWeek}
                        className="grid gap-3 rounded-2xl border border-[#eceff3] bg-white p-3 sm:grid-cols-[1fr_auto_auto]"
                      >
                        <label className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={row.isOpen}
                            onChange={(event) =>
                              updateScheduleRow(day.dayOfWeek, {
                                isOpen: event.target.checked,
                              })
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span className="text-sm font-semibold text-slate-800">
                            {day.label}
                          </span>
                        </label>

                        <input
                          type="time"
                          value={row.openingTime}
                          disabled={!row.isOpen}
                          onChange={(event) =>
                            updateScheduleRow(day.dayOfWeek, {
                              openingTime: event.target.value,
                            })
                          }
                          className="rounded-xl border border-[#e5e7eb] px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
                        />

                        <input
                          type="time"
                          value={row.closingTime}
                          disabled={!row.isOpen}
                          onChange={(event) =>
                            updateScheduleRow(day.dayOfWeek, {
                              closingTime: event.target.value,
                            })
                          }
                          className="rounded-xl border border-[#e5e7eb] px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <label className="mt-5 block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Share2 className="h-4 w-4" /> Instagram URL
                </span>
                <input
                  value={form.instagramUrl}
                  onChange={(e) => setForm((s) => ({ ...s, instagramUrl: e.target.value }))}
                  placeholder="https://instagram.com/yourshop"
                  className={cn(
                    'w-full rounded-2xl border px-4 py-3 text-sm',
                    form.instagramUrl.trim() && !isInstagramUrl(normalizeSocialUrl(form.instagramUrl))
                      ? 'border-rose-300 bg-rose-50'
                      : 'border-[#e5e7eb]',
                  )}
                />
              </label>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Link2 className="h-4 w-4" /> TikTok Reels (up to {MAX_TIKTOK_LINKS})
                  </span>
                  {form.tiktokUrls.length < MAX_TIKTOK_LINKS ? (
                    <button
                      type="button"
                      onClick={addTikTokField}
                      className="flex items-center gap-1 rounded-full border border-[#d9def8] bg-[#f1f4ff] px-3 py-1 text-xs font-semibold text-[#111b65]"
                    >
                      <Plus className="h-3 w-3" /> Add link
                    </button>
                  ) : null}
                </div>
                <div className="space-y-3">
                  {form.tiktokUrls.map((url, index) => {
                    const normalized = normalizeSocialUrl(url);
                    const valid = !normalized || isTikTokUrl(normalized);
                    return (
                      <div key={index} className="flex gap-2">
                        <input
                          value={url}
                          onChange={(e) => updateTikTok(index, e.target.value)}
                          placeholder="https://tiktok.com/@shop/video/..."
                          className={cn(
                            'flex-1 rounded-2xl border px-4 py-3 text-sm',
                            !valid ? 'border-rose-300 bg-rose-50' : 'border-[#e5e7eb]',
                          )}
                        />
                        {form.tiktokUrls.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeTikTokField(index)}
                            className="rounded-2xl border border-rose-200 p-3 text-rose-500 hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              {error ? (
                <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">{error}</div>
              ) : null}
              {message ? (
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>
              ) : null}

              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="mt-5 w-full rounded-2xl bg-[#111b65] py-3.5 text-sm font-semibold text-white hover:bg-[#1a2578] disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Saving…' : 'Save Branding'}
              </button>
            </article>
          </section>

          <aside className="space-y-6">
            <article className="rounded-[28px] border border-[#eceff3] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
              <p className="text-[11px] uppercase tracking-[0.32em] text-slate-400">Mobile Preview</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">Customer App Preview</h3>
              <p className="mt-1 text-sm text-slate-500">These are the images customers will see right away.</p>

              <div className="mt-5 overflow-hidden rounded-2xl border border-[#eceff3]">
                <div
                  className="h-28 bg-cover bg-center"
                  style={{
                    backgroundImage: coverImageUrl
                      ? `url(${coverImageUrl})`
                      : 'linear-gradient(135deg, #111b65, #4f46e5)',
                  }}
                />
                <div className="flex items-center gap-3 p-4">
                  <div
                    className="h-12 w-12 rounded-xl bg-cover bg-center ring-2 ring-white"
                    style={{
                      backgroundImage: logoUrl
                        ? `url(${logoUrl})`
                        : 'linear-gradient(135deg, #eef2ff, #d9def8)',
                    }}
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Your Shop</p>
                    {form.instagramUrl.trim() && isInstagramUrl(normalizeSocialUrl(form.instagramUrl)) ? (
                      <p className="text-xs text-[#111b65]">Follow on Instagram</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <p className="mt-5 text-xs uppercase tracking-[0.2em] text-slate-400">TikTok Reels</p>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
                {validTikTokPreviews.length === 0 ? (
                  <div className="flex h-28 w-24 flex-shrink-0 items-center justify-center rounded-xl border border-dashed border-[#d9dee8] bg-[#f8f9fa] text-xs text-slate-400">
                    Paste a TikTok link
                  </div>
                ) : (
                  validTikTokPreviews.map((url) => (
                    <div
                      key={url}
                      className="relative flex h-28 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 to-slate-700"
                    >
                      <Play className="h-8 w-8 text-white/90" />
                      <span className="absolute bottom-1 left-1 right-1 truncate text-[10px] text-white/80">
                        {extractTikTokVideoId(url) ? 'Video ready' : 'TikTok'}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {galleryUrls.length ? (
                <>
                  <p className="mt-5 text-xs uppercase tracking-[0.2em] text-slate-400">Photos</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {galleryUrls.slice(0, 6).map((url, index) => (
                      <div
                        key={`${url}-${index}`}
                        className="aspect-square rounded-xl bg-cover bg-center ring-1 ring-[#eceff3]"
                        style={{ backgroundImage: `url(${url})` }}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </article>
          </aside>
        </div>
      )}
    </PageShell>
  );
}
