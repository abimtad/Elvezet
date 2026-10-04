'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, RefreshCw, X, ChevronRight, Check, AlertCircle } from 'lucide-react';
import api from '@/lib/axios';
import { changeLabel, connection, confirmCapabilities, discardFrom, dismissNotice, retry, setIdentity, syncNow, syncStore, resolutionArtists, resolveWalkIn } from '@/lib/offline/runtime';
import type { Change } from '@/lib/offline/policy';

export default function OfflineWorkspace() {
  const status = useSyncExternalStore(syncStore.subscribe, syncStore.get, syncStore.server);
  const [open, setOpen] = useState(false);
  const [admin, setAdmin] = useState(false);
  const query = useQueryClient();
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, textarea, [tabindex="0"]') || []);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
  }, [open]);
  useEffect(() => {
    const refresh = () => { void query.invalidateQueries(); };
    const online = () => { void confirmCapabilities().then(ok => { if (ok) { connection(false); return syncNow(); } }); };
    const offline = () => connection(true);
    const visibility = () => { if (document.visibilityState === 'visible' && navigator.onLine) online(); };
    const sessionChanged = (event: StorageEvent) => { if (event.key === 'zolmi-offline-owner') void setIdentity(event.newValue); };
    const routing = (event: MouseEvent) => {
      // Next's RSC navigation requires the server. Offline links use the cached
      // full document instead. Keep modified clicks and external links untouched.
      if (navigator.onLine || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (anchor && anchor.origin === location.origin && !anchor.target && !/^\/(?:admin|auth|api)(?:\/|$)/.test(anchor.pathname) && anchor.pathname !== location.pathname) {
        event.preventDefault(); event.stopPropagation(); location.assign(anchor.href);
      }
    };
    setAdmin(location.pathname.startsWith('/admin'));
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    window.addEventListener('zolmi-offline-refresh', refresh);
    window.addEventListener('storage', sessionChanged);
    document.addEventListener('visibilitychange', visibility); document.addEventListener('click', routing, true);
    if (!location.pathname.startsWith('/admin')) {
      void setIdentity(null, true).then(() => { if (navigator.onLine) return api.get('/auth/me').then(online).catch(() => undefined); });
      if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
        void navigator.serviceWorker.register('/zolmi-offline-sw.js', { scope: '/' }).catch(() => undefined);
      }
    }
    const timer = window.setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') online(); }, 30000);
    return () => {
      clearInterval(timer); window.removeEventListener('online', online); window.removeEventListener('offline', offline);
      window.removeEventListener('zolmi-offline-refresh', refresh); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('click', routing, true);
      window.removeEventListener('storage', sessionChanged);
    };
  }, [query]);
  useEffect(() => {
    if (!status.notice) return;
    const timer = setTimeout(dismissNotice, 2000); return () => clearTimeout(timer);
  }, [status.notice]);
  if (admin || !status.scope) return null;
  const problems = !!status.storageError || status.items.some(i => i.state !== 'pending');
  return <>
    {status.notice && <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 top-5 z-[100] mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2 rounded-2xl border border-white/70 bg-white/85 px-4 py-3 text-sm text-slate-700 shadow-sm backdrop-blur-xl">
      {status.offline ? <CloudOff size={16} /> : <Check size={16} />}{status.notice}
    </div>}
    <button type="button" onClick={() => setOpen(true)} aria-label="Open saved work and sync status" className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-2xl border border-[#e5e7eb] bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm focus-visible:outline-2 focus-visible:outline-[#111b65]">
      {problems ? <AlertCircle size={14} /> : status.offline ? <CloudOff size={14} /> : <RefreshCw size={14} className={status.syncing ? 'animate-spin' : ''} />}
      {status.syncing ? 'Syncing' : status.items.length ? `${status.items.length} pending` : status.offline ? 'Saved view' : 'Saved work'}
    </button>
    {open && <div className="fixed inset-0 z-[90] flex justify-end bg-slate-900/20" onClick={() => setOpen(false)}>
      <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="sync-title" className="flex h-full w-full max-w-md flex-col bg-[#f8f9fa] text-slate-900" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
        <header className="flex items-start justify-between border-b border-[#eceff3] bg-white p-5">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400">Workspace</p><h2 id="sync-title" className="mt-1 text-xl font-semibold">Saved work</h2></div>
          <button autoFocus onClick={() => setOpen(false)} aria-label="Close saved work" className="rounded-xl p-2 hover:bg-slate-50"><X size={18} /></button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <p className="text-sm text-slate-500">{status.offline ? 'Changes stay on this browser until a connection is available.' : 'Saved changes sync when this website is open and connected.'}</p>
          <p className="text-xs text-slate-400">{status.lastSync ? `Last sync: ${new Date(status.lastSync).toLocaleString()}` : 'No offline changes synchronized yet.'}</p>
          {status.storageError && <p role="alert" className="text-sm text-rose-700">{status.storageError}</p>}
          {!status.items.length && !status.storageError && <p className="rounded-[28px] border border-[#eceff3] bg-white p-5 text-sm text-slate-500">All saved changes have been synced. Pages you have downloaded are available offline for up to 30 days.</p>}
          {status.items.map(item => <article key={item.key} className="space-y-3 rounded-[28px] border border-[#eceff3] bg-white p-5">
            <div className="flex justify-between gap-3"><h3 className="text-sm font-semibold">{changeLabel(item)}</h3><span className="text-xs text-slate-500">{item.state === 'conflict' ? 'Needs review' : item.state === 'failed' ? 'Not synced' : 'Pending'}</span></div>
            <p className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleString()} · {item.shopName || `Shop ${item.shop.slice(-6)}`}</p>
            <dl className="space-y-1 text-sm">{Object.entries(item.body || {}).filter(([key, value]) => !/key|password/i.test(key) && ['string', 'number', 'boolean'].includes(typeof value)).map(([key, value]) => <div key={key} className="flex justify-between gap-4"><dt className="text-slate-500">{key.replace(/([A-Z])/g, ' $1')}</dt><dd className="max-w-[65%] break-words text-right">{String(value)}</dd></div>)}</dl>
            {item.error && <p role="alert" className="text-sm text-rose-700">{item.error}</p>}
            {item.state === 'conflict' && (item.path.endsWith('/walk-in') ? <ResolveWalkIn item={item} /> : <p className="text-xs leading-5 text-slate-500">Nothing was overwritten. Keep the current server version, then reopen this record to make a revised change.</p>)}
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
              {item.state === 'failed' && <button disabled={status.syncing} onClick={() => void retry(item.key)} className="text-[#111b65] disabled:opacity-50">Retry unchanged</button>}
              <button disabled={status.syncing} onClick={() => { if (confirm('Discard this saved change? Later changes will be held for review because they may depend on it.')) void discardFrom(item.key).catch(error => alert(error.message || 'Reconnect before cancelling this shared conflict.')); }} className="text-slate-500 disabled:opacity-50">{item.state === 'conflict' && item.path.endsWith('/walk-in') ? 'Cancel local booking' : item.state === 'conflict' ? 'Keep server version' : 'Discard change'}</button>
            </div>
          </article>)}
        </div>
        <footer className="border-t border-[#eceff3] bg-white p-5"><button disabled={status.syncing || status.offline} onClick={() => void syncNow()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111b65] px-4 py-3 text-sm font-medium text-white disabled:opacity-40"><RefreshCw size={15} className={status.syncing ? 'animate-spin' : ''} />Sync saved changes<ChevronRight size={15} /></button></footer>
      </section>
    </div>}
  </>;
}

function ResolveWalkIn({ item }: { item: Change }) {
  const [artists, setArtists] = useState<Array<{ id: string; name: string }>>([]);
  const [artist, setArtist] = useState(item.body?.staffPlan?.[0]?.staffId || '');
  const date = new Date(item.body?.startTime);
  const [start, setStart] = useState(new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; void resolutionArtists(item).then(rows => { if (active) setArtists(rows); }); return () => { active = false; }; }, [item]);
  return <form className="space-y-3" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { await resolveWalkIn(item.key, start, artist); } catch (error: any) { setError(error.message); } finally { setBusy(false); }
  }}>
    <p className="text-xs leading-5 text-slate-500">The online booking stays unchanged. Choose another artist or time. The server checks availability before confirming.</p>
    <label className="block text-xs text-slate-500">Professional<select value={artist} onChange={event => setArtist(event.target.value)} className="mt-1 w-full border-b border-slate-200 bg-transparent py-2 text-sm text-slate-800 outline-none focus:border-[#111b65]">{artists.map(artist => <option key={artist.id} value={artist.id}>{artist.name}</option>)}</select></label>
    <label className="block text-xs text-slate-500">New date and time<input required type="datetime-local" value={start} onChange={event => setStart(event.target.value)} className="mt-1 w-full border-b border-slate-200 bg-transparent py-2 text-sm text-slate-800 outline-none focus:border-[#111b65]" /></label>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    <button disabled={busy} className="rounded-2xl bg-[#111b65] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{busy ? 'Checking…' : 'Check and resubmit'}</button>
  </form>;
}
