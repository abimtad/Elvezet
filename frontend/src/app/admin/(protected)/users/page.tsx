"use client";

import { useEffect, useState } from "react";
import { adminService } from "@/services/admin.service";

type AdminUser = {
  _id: string;
  fullName: string;
  email: string;
  phoneNumber?: string;
  noShowCount?: number;
  isBanned?: boolean;
};

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const refresh = () => {
    adminService
      .listUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-normal text-teal-700">Users</p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900">Customer Management</h2>
        <p className="mt-2 text-sm text-slate-500">Review no-shows and control bans from one table.</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-white text-slate-500">
            <tr>
              <th className="px-6 py-4 text-left font-medium">Name</th>
              <th className="px-6 py-4 text-left font-medium">Email</th>
              <th className="px-6 py-4 text-left font-medium">Phone</th>
              <th className="px-6 py-4 text-left font-medium">No-Show Count</th>
              <th className="px-6 py-4 text-left font-medium">Global Ban</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {users.map((user) => (
              <tr key={user._id}>
                <td className="px-6 py-4 font-medium text-slate-900">{user.fullName}</td>
                <td className="px-6 py-4">{user.email}</td>
                <td className="px-6 py-4">{user.phoneNumber || "—"}</td>
                <td className="px-6 py-4">{user.noShowCount ?? 0}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={async () => {
                      setLoadingId(user._id);
                      try {
                        await adminService.toggleBan(user._id, !user.isBanned);
                        refresh();
                      } finally {
                        setLoadingId(null);
                      }
                    }}
                    disabled={loadingId === user._id}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
                      user.isBanned
                        ? "bg-rose-500/15 text-rose-200"
                        : "bg-emerald-500/15 text-emerald-200"
                    }`}
                  >
                    {loadingId === user._id
                      ? "Saving..."
                      : user.isBanned
                        ? "Unban"
                        : "Ban"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
