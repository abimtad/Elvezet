"use client";

import { useEffect, useState } from "react";
import { adminService } from "@/services/admin.service";
import api from "@/lib/axios";
import { Eye } from "lucide-react";

type QueueItem = {
  _id: string;
  name: string;
  idCardUrl?: string;
  idNumber?: string;
  ownerId?: {
    fullName?: string;
    email?: string;
    phoneNumber?: string;
  };
};

export default function VerificationQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const refresh = () => {
    adminService
      .getVerificationQueue()
      .then(setItems)
      .catch(() => setItems([]));
  };

  useEffect(() => {
    refresh();
  }, []);

  const viewDocument = async (item: QueueItem) => {
    setLoadingId(item._id);
    try {
      const url = new URL(item.idCardUrl!);
      const base = new URL(api.defaults.baseURL!);
      if (url.origin !== base.origin || !url.pathname.startsWith('/uploads/id-cards/')) throw new Error();
      const response = await api.get<Blob>(url.href, { responseType: 'blob' });
      const objectUrl = URL.createObjectURL(response.data);
      const link = document.createElement('a'); link.href = objectUrl; link.download = `verification-${item._id}.webp`; link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch { setStatusMessage('Could not open this private verification document.'); }
    finally { setLoadingId(null); }
  };

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-normal text-teal-700">
          Verification
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900">
          Verification Queue
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Independent tenants waiting for approval.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-white text-slate-500">
            <tr>
              <th className="px-6 py-4 text-left font-medium">Barber</th>
              <th className="px-6 py-4 text-left font-medium">ID Number</th>
              <th className="px-6 py-4 text-left font-medium">ID Card</th>
              <th className="px-6 py-4 text-left font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {items.map((item) => (
              <tr key={item._id}>
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-900">{item.ownerId?.fullName || item.name}</div>
                  <div className="text-xs text-slate-500">{item.ownerId?.email || "No email"}</div>
                </td>
                <td className="px-6 py-4">{item.idNumber || "Pending"}</td>
                <td className="px-6 py-4">
                  {item.idCardUrl ? (
                    <button disabled={loadingId === item._id} title="Open private ID document" onClick={() => void viewDocument(item)} className="inline-flex items-center gap-2 rounded-md border p-2 text-sm"><Eye size={16} />View document</button>
                  ) : (
                    <span className="text-slate-500">Missing</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={async () => {
                      setLoadingId(item._id);
                      setStatusMessage(null);
                      try {
                        await adminService.verifyBarber(item._id);
                        setStatusMessage(`${item.name} activated successfully.`);
                        refresh();
                      } finally {
                        setLoadingId(null);
                      }
                    }}
                    disabled={loadingId === item._id}
                    className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-60"
                  >
                    {loadingId === item._id ? "Activating..." : "Approve & Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {statusMessage ? (
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}
