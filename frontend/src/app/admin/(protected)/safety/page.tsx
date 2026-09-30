"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, RefreshCw, Trash2 } from "lucide-react";
import api from "@/lib/axios";

type Report = { _id: string; targetType: string; reason: string; details?: string; createdAt: string; reporterId?: { fullName: string }; content?: { comment?: string; text?: string; title?: string; name?: string } };
type Deletion = { _id: string; contact?: string; userId?: string; status: string; attempts: number; createdAt: string; lastFailureStage?: string; nextAttemptAt?: string };

export default function SafetyPage() {
  const [tab, setTab] = useState("reports");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountIds, setAccountIds] = useState<Record<string, string>>({});
  const queue = useQuery({ queryKey: ["admin", "safety"], retry: 1, queryFn: async () => {
      const [r, d] = await Promise.all([api.get<Report[]>("/admin/content-reports"), api.get<Deletion[]>("/admin/account-deletion-requests")]);
      return { reports: r.data, requests: d.data };
  }});
  const reports = queue.data?.reports || [];
  const requests = queue.data?.requests || [];
  const loading = queue.isFetching;
  const load = async () => { await queue.refetch({ throwOnError: true }); };
  const resolve = async (id: string, action: "dismiss" | "remove") => {
    if (action === "remove" && !window.confirm("Remove this content from public view?")) return;
    setBusy(id); setError(null);
    try { await api.patch(`/admin/content-reports/${id}`, { action }); await load(); }
    catch { setError("Could not resolve this report. It remains in the queue."); }
    finally { setBusy(null); }
  };
  const verify = async (request: Deletion) => {
    if (!window.confirm("Have you verified this person's ownership of the account through their registered contact? This permanently deletes their account.")) return;
    setBusy(request._id); setError(null);
    try {
      await api.post(`/admin/account-deletion-requests/${request._id}/verify`, { userId: accountIds[request._id], ownershipVerified: true });
      await load();
    } catch { setError("Deletion was not accepted. Check the account ID and matching registered email or phone."); }
    finally { setBusy(null); }
  };
  return <section className="space-y-5">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Safety & Privacy</h1><button title="Refresh queues" aria-label="Refresh queues" disabled={loading || !!busy} onClick={() => { setError(null); void queue.refetch(); }} className="rounded-md border p-2"><RefreshCw size={18} /></button></div>
    <div role="tablist" className="flex gap-5 border-b border-slate-200">
      {[['reports', `Content reports (${reports.length})`], ['deletions', `Account deletion (${requests.length})`]].map(([id, label]) => <button role="tab" aria-selected={tab === id} key={id} onClick={() => setTab(id)} className={`border-b-2 py-3 text-sm ${tab === id ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500'}`}>{label}</button>)}
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {queue.isError && <p role="alert" className="text-sm text-red-700">Could not load the safety queues. Check your administrator access and retry.</p>}
    {loading ? <p className="py-8 text-slate-500">Loading queues...</p> : tab === "reports" ? <div className="divide-y divide-slate-200">
      {!reports.length && <p className="py-10 text-slate-500">No open content reports.</p>}
      {reports.map(report => <article key={report._id} className="py-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold capitalize">{report.targetType.replaceAll('_', ' ')} / {report.reason}</h2><p className="mt-1 text-xs text-slate-500">{report.reporterId?.fullName || 'Deleted reporter'} · {new Date(report.createdAt).toLocaleString()}</p></div>
          <div className="flex gap-2"><button disabled={!!busy} onClick={() => void resolve(report._id, "dismiss")} className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm"><Check size={16} />Dismiss</button><button disabled={!!busy} onClick={() => void resolve(report._id, "remove")} className="flex items-center gap-2 rounded-md bg-red-700 px-3 py-2 text-sm text-white"><Trash2 size={16} />Remove</button></div>
        </div><p className="mt-4 whitespace-pre-wrap break-words text-sm">{report.content?.comment || report.content?.text || report.content?.title || report.content?.name || 'Content no longer available.'}</p>{report.details && <p className="mt-2 text-sm text-slate-600">Report details: {report.details}</p>}
      </article>)}
    </div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-slate-500"><tr><th className="p-3">Contact / account</th><th className="p-3">Requested</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y">
      {!requests.length && <tr><td colSpan={4} className="py-10 text-slate-500">No pending deletion requests.</td></tr>}
      {requests.map(request => <tr key={request._id}><td className="p-3">{request.contact || request.userId || 'Account cleanup'}</td><td className="p-3">{new Date(request.createdAt).toLocaleDateString()}</td><td className="p-3">{request.status === 'pending' ? `Cleanup pending (${request.attempts} attempts)` : 'Ownership verification required'}</td><td className="p-3">{request.status === 'verification_required' ? <div className="flex flex-wrap gap-2"><input aria-label={`Account ID for ${request.contact}`} placeholder="Verified account ID" value={accountIds[request._id] || ''} onChange={e => setAccountIds({ ...accountIds, [request._id]: e.target.value })} className="rounded-md border px-3 py-2" /><button disabled={!!busy || !accountIds[request._id]} onClick={() => void verify(request)} className="rounded-md bg-red-700 px-3 py-2 text-white disabled:opacity-50">Verify & Delete</button></div> : `Automatic retry${request.nextAttemptAt ? ' after ' + new Date(request.nextAttemptAt).toLocaleString() : ''}${request.lastFailureStage ? ' / ' + request.lastFailureStage.replaceAll('_', ' ') : ''}`}</td></tr>)}
    </tbody></table></div>}
  </section>;
}
