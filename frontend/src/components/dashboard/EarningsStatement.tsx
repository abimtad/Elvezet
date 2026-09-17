'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/axios';

type Entry = { _id: string; type: string; amount: number; reason: string; recordedAt: string; method?: string; reference?: string };
type Statement = { name: string; earned: number; adjustments: number; paidOut: number; balance: number; entries: Entry[]; total: number; historicalNote: string; independent: boolean };
type Body = { key: string; type: string; reason: string; amount?: number; method?: string; reference?: string; reversesId?: string };
const money = (n: number) => `ETB ${n.toFixed(2)}`;

export default function EarningsStatement({ businessId, beneficiary }: { businessId: string; beneficiary: string }) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Body | null>(null);
  const [error, setError] = useState('');
  const [type, setType] = useState('payout');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const path = `/earnings/${businessId}/${encodeURIComponent(beneficiary)}`;
  const query = useQuery<Statement>({ queryKey: ['earnings', businessId, beneficiary, page], queryFn: async () => (await api.get(path, { params: { page } })).data.data, enabled: !!businessId && !!beneficiary });
  async function save(body: Body) {
    if (busy) return;
    setBusy(true); setPending(body); setError('');
    try {
      await api.post(path, body);
      setPending(null); setReason(''); setAmount(''); setReference(''); setPage(1);
      await client.invalidateQueries({ queryKey: ['earnings', businessId, beneficiary] });
    } catch (e: unknown) {
      const response = e as { response?: { status?: number; data?: { message?: string } } };
      if (response.response?.status && response.response.status >= 400 && response.response.status < 500) setPending(null);
      setError(response.response?.data?.message || 'Could not save. Retry the same entry to avoid duplicates.');
    } finally { setBusy(false); }
  }
  const s = query.data;
  return <section className="space-y-4 rounded-xl border bg-white p-5">
    <h2 className="text-lg font-semibold">Earnings and recorded payments</h2>
    {query.isPending && <p>Loading statement…</p>}
    {query.isError && <button onClick={() => query.refetch()}>Could not load earnings. Retry</button>}
    {s && <>
      <p>{s.name} · All-time statement</p>
      <dl className="grid gap-3 sm:grid-cols-2"><div><dt>{s.independent ? 'Completed paid revenue' : 'Commission earned'}</dt><dd>{money(s.earned)}</dd></div><div><dt>Adjustments</dt><dd>{money(s.adjustments)}</dd></div><div><dt>{s.independent ? 'Withdrawals recorded' : 'Staff payments recorded'}</dt><dd>{money(s.paidOut)}</dd></div><div><dt>Outstanding balance</dt><dd>{money(s.balance)}</dd></div></dl>
      <p className="text-sm text-slate-500">{s.historicalNote}</p>
      <p className="text-sm">Record money already paid. This form does not transfer money.</p>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); const n = Number(amount); if (!Number.isFinite(n) || !n || type === 'payout' && n < 0) { setError('Enter a valid amount.'); return; } void save({ key: crypto.randomUUID(), type, amount: n, reason, ...(type === 'payout' ? { method, reference } : {}) }); }}>
        <label>Entry type<select className="block w-full rounded border p-2" value={type} onChange={e => setType(e.target.value)}><option value="payout">Record payment</option><option value="adjustment">Adjustment</option></select></label>
        <label>Amount (ETB)<input className="block w-full rounded border p-2" required type="number" step="0.01" min={type === 'payout' ? '0.01' : '-10000000'} max="10000000" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>Reason<input className="block w-full rounded border p-2" required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
        {type === 'payout' && <><label>Method<select className="block w-full rounded border p-2" value={method} onChange={e => setMethod(e.target.value)}>{['cash', 'bank', 'telebirr', 'other'].map(m => <option key={m}>{m}</option>)}</select></label><label>Reference (optional)<input className="block w-full rounded border p-2" maxLength={150} value={reference} onChange={e => setReference(e.target.value)} /></label></>}
        <button className="rounded bg-slate-900 p-2 text-white disabled:opacity-50" disabled={busy || !!pending}>Record entry</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {pending && <button disabled={busy} onClick={() => save(pending)}>Retry the same entry safely</button>}
      <ul className="divide-y">{s.entries.map(entry => <li className="py-3" key={entry._id}><p>{entry.type} · {money(entry.amount)} · {new Date(entry.recordedAt).toLocaleString()}</p><p>{entry.reason}</p>{entry.method && <p>{entry.method} · {entry.reference || 'No reference'}</p>}{entry.type === 'payout' && <button className="underline" disabled={busy || !!pending} onClick={() => { const explanation = window.prompt('Reason for reversing this recorded payment:'); if (explanation && explanation.trim().length >= 3) void save({ key: crypto.randomUUID(), type: 'payout_reversal', reversesId: entry._id, reason: explanation.trim() }); }}>Reverse recorded payment</button>}</li>)}</ul>
      <div className="flex gap-4"><button disabled={page <= 1 || busy} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page}</span><button disabled={page * 50 >= s.total || busy} onClick={() => setPage(p => p + 1)}>Next</button></div>
    </>}
  </section>;
}
