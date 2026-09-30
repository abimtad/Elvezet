"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminService, AdminStats } from "@/services/admin.service";
import { authService } from "@/services/auth.service";
import { classifyRequestError } from "@/lib/adminAuth";
import { Building2, Users, CalendarDays, Wallet, RefreshCw } from "lucide-react";

type LoadError = "session" | "forbidden" | "network" | null;

export default function AdminOverviewPage() {
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [role, setRole] = useState<"admin" | "moderator" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError>(null);

  const loadStats = () => {
    setLoading(true);
    setError(null);
    adminService
      .getGlobalStats()
      .then(setStats)
      .catch((err) => setError(classifyRequestError(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStats();

    authService
      .getCurrentUser()
      .then((user) => {
        if (!user) {
          setRole(null);
          return;
        }
        setRole(user.roles?.includes("admin") ? "admin" : "moderator");
      })
      .catch((err) => {
        const kind = classifyRequestError(err);
        if (kind === "session") {
          router.replace("/admin/signin?reason=session");
          return;
        }
        if (kind === "forbidden") {
          router.replace("/");
          return;
        }
        setRole(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error === "session") {
      router.replace("/admin/signin?reason=session");
    } else if (error === "forbidden") {
      router.replace("/admin/signin?reason=forbidden");
    }
  }, [error, router]);

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-normal text-teal-700">Overview</p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900">Global Analytics</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          A single control room for network-wide health, volume, and tenant activity.
        </p>
      </div>

      {error === "network" ? (
        <div
          role="alert"
          className="flex items-center justify-between border-l-4 border-rose-500 bg-rose-50 p-4 text-sm text-rose-800"
        >
          Could not reach the server. Check your connection and try again.
          <button type="button" onClick={loadStats} className="flex items-center gap-2">
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      ) : null}

      {error === "forbidden" ? (
        <div role="alert" className="border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-900">
          Access denied. You do not have permission to view analytics.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Businesses"
          icon={<Building2 size={19} />}
          value={loading || error ? "--" : stats?.totalTenants ?? 0}
        />
        <StatCard
          label="Users"
          icon={<Users size={19} />}
          value={loading || error ? "--" : stats?.totalUsers ?? 0}
        />
        <StatCard
          label="Bookings"
          icon={<CalendarDays size={19} />}
          value={loading || error ? "--" : stats?.totalBookings ?? 0}
        />
        {role === "admin" ? (
          <StatCard
            label="Revenue (ETB)"
            icon={<Wallet size={19} />}
            value={
              loading || error ? "--" : (stats?.totalRevenue ?? 0).toLocaleString()
            }
            accent
          />
        ) : null}
      </div>

      <div className="border-t border-slate-200 pt-6">
        <h3 className="text-lg font-semibold text-slate-900">Shop Performance</h3>
        <div className="mt-4 divide-y divide-slate-200">
          <div className="flex justify-between py-3 text-xs font-medium text-slate-500">
            <span>Business</span>
            <span>Bookings</span>
          </div>
          {!loading && !error && !stats?.shopPerformance?.length ? (
            <p className="py-6 text-sm text-slate-500">No shop activity yet.</p>
          ) : null}
          {(stats?.shopPerformance || []).slice(0, 5).map((shop) => (
            <div
              key={shop.businessId}
              className="flex items-center justify-between gap-4 py-4 text-sm text-slate-700"
            >
              <span>{shop.name}</span>
              <span>{shop.bookings} bookings</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  accent = false,
  icon,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <article
      className={`rounded-lg border p-5 ${
        accent ? "border-teal-200 bg-teal-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between text-slate-500">
        <p className="text-sm">{label}</p>
        {icon}
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-900">{value}</div>
    </article>
  );
}
