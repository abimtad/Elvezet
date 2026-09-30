"use client";

import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { adminService } from "@/services/admin.service";

type CategoryItem = {
  _id: string;
  name: string;
  isActive?: boolean;
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = () => {
    adminService
      .listCategories()
      .then(setCategories)
      .catch(() => setMessage("Could not load categories. Please try again."));
  };

  useEffect(() => {
    refresh();
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    setMessage(null);
    try {
      await adminService.createCategory(trimmed);
      setName("");
      setMessage(`Category "${trimmed}" saved.`);
      refresh();
    } catch (error) {
      setMessage(readErrorMessage(error, "Failed to create category"));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: CategoryItem) => {
    setEditingId(item._id);
    setEditingName(item.name);
    setMessage(null);
  };

  const saveEdit = async (item: CategoryItem) => {
    const trimmed = editingName.trim();
    if (!trimmed) return;

    setBusyId(item._id);
    setMessage(null);
    try {
      await adminService.updateCategory(item._id, trimmed);
      setEditingId(null);
      setEditingName("");
      setMessage(`Business category renamed to "${trimmed}". Linked businesses were updated too.`);
      refresh();
    } catch (error) {
      setMessage(readErrorMessage(error, "Failed to update category"));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: CategoryItem) => {
    setBusyId(item._id);
    setMessage(null);
    try {
      await adminService.deleteCategory(item._id);
      setMessage(`Category "${item.name}" removed.`);
      refresh();
    } catch (error) {
      setMessage(readErrorMessage(error, "Failed to delete category"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-normal text-teal-700">Catalog</p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900">Business Categories</h2>
        <p className="mt-2 text-sm text-slate-500">
          Create the discovery categories used on Flutter Home and Search.
          Rename is safe: linked businesses are updated. Delete is blocked when
          a category is still used by shops or independent barbers.
        </p>
      </div>

      <form
        onSubmit={create}
        className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 md:flex-row md:items-end"
      >
        <label className="flex-1 space-y-2">
          <span className="block text-sm font-medium text-slate-800">Business category name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Barber Shop"
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-teal-300 focus:ring-2 focus:ring-amber-500/20"
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Add Business Category"}
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-white text-slate-500">
            <tr>
              <th className="px-6 py-4 text-left font-medium">Name</th>
              <th className="px-6 py-4 text-left font-medium">Status</th>
              <th className="px-6 py-4 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {categories.map((item) => (
              <tr key={item._id}>
                <td className="px-6 py-4 font-medium text-slate-900">
                  {editingId === item._id ? (
                    <input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      className="w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-300 focus:ring-2 focus:ring-amber-500/20"
                    />
                  ) : (
                    item.name
                  )}
                </td>
                <td className="px-6 py-4">
                  {item.isActive ? (
                    <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-800">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    {editingId === item._id ? (
                      <>
                        <button
                          onClick={() => void saveEdit(item)}
                          disabled={busyId === item._id}
                          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-500/20 disabled:opacity-60"
                          title="Save category name"
                        >
                          <Check size={14} />
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditingName("");
                          }}
                          disabled={busyId === item._id}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-700 disabled:opacity-60"
                          title="Cancel edit"
                        >
                          <X size={14} />
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(item)}
                          disabled={Boolean(busyId)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-700 disabled:opacity-60"
                          title="Edit category name"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                        <button
                          onClick={() => remove(item)}
                          disabled={busyId === item._id}
                          className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
                          title="Delete category"
                        >
                          <Trash2 size={14} />
                          {busyId === item._id ? "Deleting..." : "Delete"}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!categories.length ? (
              <tr>
                <td className="px-6 py-6 text-slate-500" colSpan={3}>
                  No categories found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {message ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string; error?: string }
      | undefined;
    return data?.message || data?.error || error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
