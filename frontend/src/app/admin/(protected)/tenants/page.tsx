"use client";

import { useEffect, useState } from "react";
import { adminService, CategoryItem } from "@/services/admin.service";
import CategoryCombobox from "@/components/CategoryCombobox";

type Tenant = {
  _id: string;
  name: string;
  type: "shop" | "independent";
  businessCategoryId?: string;
  businessCategoryName?: string;
  verificationStatus: "pending" | "active" | "suspended";
  productsEnabled?: boolean;
  idCardUrl?: string;
  idNumber?: string;
};

function TenantCategoryCell({
  tenant,
  categories,
  busy,
  onSelectId,
}: {
  tenant: Tenant;
  categories: CategoryItem[];
  busy: boolean;
  onSelectId: (businessCategoryId: string) => void;
}) {
  const savedName =
    categories.find((c) => c._id === tenant.businessCategoryId)?.name ||
    tenant.businessCategoryName ||
    "";
  const [draft, setDraft] = useState(savedName);

  useEffect(() => {
    setDraft(savedName);
  }, [savedName, tenant._id]);

  return (
    <CategoryCombobox
      kind="business"
      allowCustom={false}
      disabled={busy || categories.length === 0}
      value={draft}
      placeholder="Search category"
      inputClassName="min-w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-900 outline-none focus:border-teal-300 disabled:cursor-not-allowed disabled:text-slate-500"
      onChange={(label) => {
        setDraft(label);
        const match = categories.find(
          (c) => c.name.toLowerCase() === label.trim().toLowerCase(),
        );
        if (match && match._id !== tenant.businessCategoryId) {
          onSelectId(match._id);
        }
      }}
    />
  );
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [busyTenantId, setBusyTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const normalizeTenants = (payload: unknown): Tenant[] => {
    if (Array.isArray(payload)) return payload as Tenant[];
    if (payload && typeof payload === "object") {
      const data = (payload as { data?: unknown }).data;
      if (Array.isArray(data)) return data as Tenant[];
    }
    return [];
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([adminService.listTenants(), adminService.listCategories()])
      .then(([tenantPayload, categoryPayload]) => {
        if (cancelled) return;
        setTenants(normalizeTenants(tenantPayload));
        setCategories(
          Array.isArray(categoryPayload)
            ? categoryPayload
            : Array.isArray((categoryPayload as { data?: unknown })?.data)
              ? ((categoryPayload as { data: CategoryItem[] }).data)
              : [],
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTenants([]);
        const message =
          err && typeof err === "object" && "response" in err
            ? String(
                (err as { response?: { status?: number; data?: { message?: string } } })
                  .response?.data?.message ||
                  (err as { response?: { status?: number } }).response?.status ||
                  "Failed to load tenants",
              )
            : err instanceof Error
              ? err.message
              : "Failed to load tenants";
        setLoadError(
          `${message}. Sign in at /auth/signin with “Login as Test Admin”, then reopen this page.`,
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const updateCategory = async (tenantId: string, businessCategoryId: string) => {
    if (!businessCategoryId) return;
    setBusyTenantId(tenantId);
    try {
      const updated = await adminService.updateTenantCategory(
        tenantId,
        businessCategoryId,
      );
      setTenants((items) =>
        items.map((item) =>
          item._id === tenantId
            ? {
                ...item,
                businessCategoryId: String(updated.businessCategoryId || ""),
                businessCategoryName: updated.businessCategoryName,
              }
            : item,
        ),
      );
    } finally {
      setBusyTenantId(null);
    }
  };

  const toggleProducts = async (tenantId: string, productsEnabled: boolean) => {
    setBusyTenantId(tenantId);
    try {
      const updated = await adminService.setTenantProductsEnabled(
        tenantId,
        productsEnabled,
      );
      setTenants((items) =>
        items.map((item) =>
          item._id === tenantId
            ? {
                ...item,
                productsEnabled: Boolean(updated.productsEnabled),
              }
            : item,
        ),
      );
    } finally {
      setBusyTenantId(null);
    }
  };

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-normal text-teal-700">Tenants</p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900">Tenant Management</h2>
        <p className="mt-2 text-sm text-slate-500">
          Use the <span className="text-teal-800">Sell products</span> column to turn marketplace selling on or off per shop.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {loadError}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-white text-slate-500">
            <tr>
              <th className="px-6 py-4 text-left font-medium">Name</th>
              <th className="px-6 py-4 text-left font-medium">Type</th>
              <th className="px-6 py-4 text-left font-medium">Business Category</th>
              <th className="px-6 py-4 text-left font-medium">Status</th>
              <th className="px-6 py-4 text-left font-medium">Sell products</th>
              <th className="px-6 py-4 text-left font-medium">Verification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                  Loading tenants…
                </td>
              </tr>
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                  No tenants loaded. Sign in as Test Admin, then refresh.
                </td>
              </tr>
            ) : (
              tenants.map((tenant) => (
              <tr key={tenant._id}>
                <td className="px-6 py-4 font-medium text-slate-900">{tenant.name}</td>
                <td className="px-6 py-4 capitalize">{tenant.type}</td>
                <td className="px-6 py-4">
                  <TenantCategoryCell
                    tenant={tenant}
                    categories={categories}
                    busy={busyTenantId === tenant._id}
                    onSelectId={(id) => void updateCategory(tenant._id, id)}
                  />
                </td>
                <td className="px-6 py-4 capitalize">{tenant.verificationStatus}</td>
                <td className="px-6 py-4">
                  <label
                    className={`inline-flex cursor-pointer items-center gap-3 ${
                      busyTenantId === tenant._id ? "opacity-50" : ""
                    }`}
                    title={
                      tenant.productsEnabled
                        ? "Selling enabled — click to turn off"
                        : "Selling disabled — click to turn on"
                    }
                  >
                    <span className="relative inline-flex h-7 w-12 items-center">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={Boolean(tenant.productsEnabled)}
                        disabled={busyTenantId === tenant._id}
                        onChange={(event) =>
                          void toggleProducts(tenant._id, event.target.checked)
                        }
                      />
                      <span className="absolute inset-0 rounded-full bg-slate-700 transition peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-600" />
                      <span className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        tenant.productsEnabled
                          ? "text-emerald-700"
                          : "text-slate-500"
                      }`}
                    >
                      {tenant.productsEnabled ? "On" : "Off"}
                    </span>
                  </label>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={async () => {
                      await adminService.verifyTenant(tenant._id, {
                        idCardUrl: tenant.idCardUrl,
                        idNumber: tenant.idNumber,
                      });
                    }}
                    className="rounded-lg border border-teal-300 bg-teal-700/10 px-3 py-2 text-xs font-semibold text-teal-800"
                  >
                    Verify
                  </button>
                </td>
              </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
