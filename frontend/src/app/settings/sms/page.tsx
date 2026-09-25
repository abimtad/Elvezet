'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Save, Send } from 'lucide-react';
import PageShell, { PageHeader } from '@/components/common/PageShell';
import ShopSelector from '@/components/common/ShopSelector';
import { useSelectedShop } from '@/components/common/SelectedShopContext';
import api from '@/lib/axios';

type Settings = {
  phone: string;
  mode: string;
  subscription: null | { status: string; usedThisPeriod: number; monthlyQuota: number; enabledEvents: string[]; consentAt?: string; trialGrantedAt?: string; periodEnd: string };
  messages: { _id: string; event: string; status: string; reason?: string; attempts: number; createdAt: string }[];
};

export default function SmsSettingsPage() {
  const { selectedShopId, setSelectedShopId } = useSelectedShop();
  const client = useQueryClient();
  const path = `/sms/${selectedShopId}`;
  const query = useQuery({ queryKey: ['sms', selectedShopId], enabled: !!selectedShopId, queryFn: async () => (await api.get(path)).data.data as Settings });
  const [phone, setPhone] = useState('');
  const [created, setCreated] = useState(true);
  const [confirmed, setConfirmed] = useState(true);
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    if (!query.data) return;
    setPhone(query.data.phone);
    setConsent(!!query.data.subscription?.consentAt);
    setCreated(query.data.subscription?.enabledEvents.includes('booking_created') ?? true);
    setConfirmed(query.data.subscription?.enabledEvents.includes('booking_confirmed') ?? true);
  }, [query.data]);
  const mutation = useMutation({
    mutationFn: async (command: string) => command === 'save'
      ? api.put(path, { phone, consent, enabledEvents: [created && 'booking_created', confirmed && 'booking_confirmed'].filter(Boolean) })
      : api.post(`${path}/${command}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['sms', selectedShopId] }),
  });
  const subscription = query.data?.subscription;
  const active = ['active', 'trial'].includes(subscription?.status ?? '');
  const pending = mutation.isPending;
  return <PageShell>
    <PageHeader eyebrow="Notifications" title="SMS Alerts" description="Booking notifications" actions={<ShopSelector selectedShopId={selectedShopId} onSelect={setSelectedShopId} />} />
    {!selectedShopId ? <p>Select a business.</p> : query.isLoading ? <p role="status">Loading SMS settings...</p> : query.isError ? <button onClick={() => query.refetch()}>Retry loading settings</button> : <>
      <section className="border-b border-gray-200 py-5">
        <div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-semibold">{subscription?.status ?? 'Not subscribed'}</h2><p>{subscription?.usedThisPeriod ?? 0} / {subscription?.monthlyQuota ?? 0} SMS used</p></div>
        <p className="mt-2 text-sm text-gray-600">{query.data?.mode === 'simulation' ? 'Simulation mode: no SMS is delivered or charged.' : query.data?.mode === 'live' ? 'SMS delivery enabled through SMSEthiopia.' : 'Live SMS delivery is disabled.'}</p>
        {subscription && <p className="mt-1 text-sm text-gray-600">Period ends {new Date(subscription.periodEnd).toLocaleDateString()}</p>}
      </section>
      <form className="max-w-xl space-y-4 py-6" onSubmit={event => { event.preventDefault(); mutation.mutate('save'); }}>
        <label className="block text-sm font-medium">Shop SMS phone<input className="mt-2 block w-full rounded border border-gray-300 px-3 py-2" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+251..." required /></label>
        <label className="flex items-center gap-3"><input type="checkbox" checked={created} onChange={e => setCreated(e.target.checked)} />New bookings</label>
        <label className="flex items-center gap-3"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Booking confirmations</label>
        <label className="flex items-start gap-3"><input className="mt-1" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I agree to receive operational booking SMS at this number.</label>
        <div className="flex flex-wrap gap-3">
          <button disabled={pending || !consent} className="flex items-center gap-2 rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-50"><Save size={16} />Save</button>
          {!active && <button type="button" disabled={pending} className="rounded border px-4 py-2 disabled:opacity-50" onClick={() => mutation.mutate('request')}>Request SMS access</button>}
          {active && <button type="button" disabled={pending} className="rounded border px-4 py-2" onClick={() => mutation.mutate('pause')}>Pause</button>}
          <button type="button" disabled={pending || !active} className="flex items-center gap-2 rounded border px-4 py-2 disabled:opacity-50" onClick={() => mutation.mutate('test')}><Send size={16} />Test SMS</button>
        </div>
        {mutation.isError && <p role="alert" className="text-sm text-red-700">Could not update SMS alerts. Check your phone, subscription and connection.</p>}
      </form>
      <section className="border-t border-gray-200 py-5">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Recent messages</h2><button title="Refresh delivery history" aria-label="Refresh delivery history" onClick={() => query.refetch()}><RefreshCw size={18} /></button></div>
        {!query.data?.messages.length && <p className="py-4 text-sm text-gray-600">No messages yet.</p>}
        <ul className="divide-y divide-gray-200">{query.data?.messages.map(message => <li key={message._id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span>{message.event.replaceAll('_', ' ')}<br /><span className="text-gray-500">{new Date(message.createdAt).toLocaleString()}</span></span><span>{message.status}{message.reason && `: ${message.reason}`}</span></li>)}</ul>
      </section>
    </>}
  </PageShell>;
}
