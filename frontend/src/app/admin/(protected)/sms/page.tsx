'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';

type Business = { _id: string; name: string; type: string; smsContactPhone?: string; subscription?: { status: string; adminEnabled?: boolean; requestedAt?: string; monthlyQuota: number; usedThisPeriod: number; reservedThisPeriod: number; periodEnd: string } };
export default function SmsAdministration() {
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['admin-sms', page], queryFn: async () => (await api.get(`/sms/admin/businesses?page=${page}`)).data.data as Business[] });
  async function save(event: React.FormEvent<HTMLFormElement>, business: Business) {
    event.preventDefault(); setBusy(business._id); setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api.put(`/sms/${business._id}/admin`, { status: form.get('status'), monthlyQuota: Number(form.get('quota')), renewPeriod: form.get('renew') === 'on' });
      await client.invalidateQueries({ queryKey: ['admin-sms'] });
    } catch { setError('Could not save SMS access. Check the quota and any pending deliveries, then retry.'); }
    finally { setBusy(''); }
  }
  return <main className="space-y-5 p-6"><h1 className="text-xl font-semibold">SMS subscriptions</h1>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {query.isLoading && <p>Loading businesses...</p>}
    {query.isError && <button onClick={() => void query.refetch()}>Could not load. Retry</button>}
    <div className="divide-y divide-gray-200">{query.data?.map(b => <form key={`${b._id}-${b.subscription?.status}-${b.subscription?.periodEnd}`} onSubmit={e => void save(e, b)} className="flex flex-wrap items-end gap-4 py-5">
      <div className="min-w-48 flex-1"><h2 className="font-medium">{b.name}</h2><p className="text-sm text-gray-600">{b.type} · {b.smsContactPhone || 'No contact saved'}</p><p className="text-sm">{b.subscription?.requestedAt ? 'Access requested' : 'No request'} · {b.subscription?.usedThisPeriod || 0} used · {b.subscription?.reservedThisPeriod || 0} pending</p>{b.subscription && <p className="text-xs text-gray-500">Period ends {new Date(b.subscription.periodEnd).toLocaleDateString()}</p>}</div>
      <label className="text-sm">Access<select name="status" defaultValue={b.subscription?.status || 'paused'} className="mt-1 block rounded border p-2"><option value="active">Active</option><option value="paused">Paused</option><option value="past_due">Past due</option><option value="cancelled">Cancelled</option></select></label>
      <label className="text-sm">Monthly segments<input name="quota" type="number" min="0" max="100000" required defaultValue={b.subscription?.monthlyQuota ?? 200} className="mt-1 block w-32 rounded border p-2" /></label>
      <label className="flex items-center gap-2 text-sm"><input name="renew" type="checkbox" />Start new 30-day period</label>
      <button disabled={!!busy} className="rounded bg-teal-700 px-4 py-2 text-white disabled:opacity-50">{busy === b._id ? 'Saving...' : 'Save'}</button>
    </form>)}</div>
    <div className="flex gap-4"><button disabled={!page} onClick={() => setPage(p => p - 1)}>Previous</button><button disabled={(query.data?.length || 0) < 50} onClick={() => setPage(p => p + 1)}>Next</button></div>
  </main>;
}
