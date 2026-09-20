'use client';

import PageShell, { PageHeader } from '@/components/common/PageShell';
import ShopSelector from '@/components/common/ShopSelector';
import { useSelectedShop } from '@/components/common/SelectedShopContext';
import ListToolbar from '@/components/dashboard/ListToolbar';
import { useReviews } from '@/hooks/useBusiness';
import { Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

type ReviewRow = {
  id?: string;
  _id?: string;
  userName?: string;
  userId?: { fullName?: string } | string;
  rating?: number;
  comment?: string;
  createdAt?: string;
};

export default function ReviewsPage() {
  const { selectedShopId, setSelectedShopId } = useSelectedShop();
  const { data: reviewsRaw, isLoading, error } = useReviews(selectedShopId);
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState<'all' | '5' | '4' | '3' | 'low'>(
    'all',
  );
  const [sortKey, setSortKey] = useState<'newest' | 'highest' | 'lowest'>('newest');

  const reviews = useMemo(() => {
    const list = Array.isArray(reviewsRaw)
      ? (reviewsRaw as ReviewRow[])
      : Array.isArray((reviewsRaw as { data?: ReviewRow[] } | undefined)?.data)
        ? ((reviewsRaw as { data: ReviewRow[] }).data)
        : [];
    return list.map((r, i) => ({
      id: String(r.id || r._id || i),
      userName: r.userName || (typeof r.userId === 'object' ? r.userId?.fullName : undefined) || 'Customer',
      rating: Number(r.rating || 0),
      comment: r.comment || '',
      createdAt: r.createdAt,
    }));
  }, [reviewsRaw]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let rows = reviews.filter((r) => {
      if (ratingFilter === '5' && r.rating !== 5) return false;
      if (ratingFilter === '4' && r.rating !== 4) return false;
      if (ratingFilter === '3' && r.rating !== 3) return false;
      if (ratingFilter === 'low' && r.rating >= 3) return false;
      if (!needle) return true;
      return (
        r.userName.toLowerCase().includes(needle) ||
        r.comment.toLowerCase().includes(needle)
      );
    });
    rows = [...rows].sort((a, b) => {
      if (sortKey === 'highest') return b.rating - a.rating;
      if (sortKey === 'lowest') return a.rating - b.rating;
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    });
    return rows;
  }, [reviews, search, ratingFilter, sortKey]);

  const average =
    reviews.length === 0
      ? 0
      : reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Reputation"
        title="Customer Reviews"
        description="Read what clients say — filter by stars and search comments."
        actions={
          <ShopSelector
            selectedShopId={selectedShopId}
            onSelect={setSelectedShopId}
          />
        }
      />

      {!selectedShopId ? (
        <p className="py-16 text-center text-sm text-slate-500">
          Choose a shop to load reviews.
        </p>
      ) : isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse bg-slate-100" />
          ))}
        </div>
      ) : error ? (
        <p className="py-10 text-center text-sm text-rose-600">
          Error loading reviews. Please try again.
        </p>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Average
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
                {average.toFixed(1)}
                <span className="ml-2 text-base font-normal text-slate-400">
                  / 5 · {reviews.length} reviews
                </span>
              </p>
            </div>
          </div>

          <ListToolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search reviewer or comment…"
            countLabel={`${filtered.length} shown`}
            chips={[
              { id: 'all', label: 'All stars' },
              { id: '5', label: '5★' },
              { id: '4', label: '4★' },
              { id: '3', label: '3★' },
              { id: 'low', label: '1–2★' },
            ]}
            activeChip={ratingFilter}
            onChip={(id) => setRatingFilter(id as typeof ratingFilter)}
            trailing={
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <span>Sort</span>
                {(
                  [
                    ['newest', 'Newest'],
                    ['highest', 'Highest'],
                    ['lowest', 'Lowest'],
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

          {reviews.length === 0 ? (
            <p className="py-14 text-center text-sm text-slate-500">
              No reviews for this shop yet.
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-14 text-center text-sm text-slate-500">
              No reviews match these filters.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((review) => (
                <li key={review.id} className="flex gap-4 py-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-[#111b65]">
                    {review.userName?.[0] || 'U'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-medium text-slate-900">
                          {review.userName}
                        </h4>
                        <p className="text-xs text-slate-400">
                          {review.createdAt
                            ? new Date(review.createdAt).toLocaleDateString()
                            : '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 text-amber-400">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            size={14}
                            className={cn(i < review.rating ? '' : 'opacity-25')}
                            fill={i < review.rating ? 'currentColor' : 'none'}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      {review.comment || 'No comment provided.'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </PageShell>
  );
}
