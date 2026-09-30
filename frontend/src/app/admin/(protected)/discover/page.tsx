"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import axios from "axios";
import { Pencil, Trash2, X, ExternalLink } from "lucide-react";
import {
  adminService,
  type DiscoverVideoItem,
  type DiscoverVideoPayload,
} from "@/services/admin.service";
import CategoryCombobox from "@/components/CategoryCombobox";

const DEFAULT_CATEGORIES = [
  "Hairstyle",
  "Hair Care",
  "Makeup",
  "Beauty & Style",
];

function readErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    return data?.message || error.message || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

const emptyForm: DiscoverVideoPayload = {
  title: "",
  creatorName: "",
  category: "Hairstyle",
  youtubeUrl: "",
  description: "",
  sortOrder: 0,
  isActive: true,
};

export default function DiscoverAdminPage() {
  const [videos, setVideos] = useState<DiscoverVideoItem[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [form, setForm] = useState<DiscoverVideoPayload>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [customCategories, setCustomCategories] = useState<{ _id: string; name: string }[]>([]);
  const [categoryBusy, setCategoryBusy] = useState(false);

  const contentCategories = useMemo(
    () => categories.filter((c) => c !== "All"),
    [categories],
  );

  const refresh = () => {
    adminService.listDiscoverCategories().then(setCustomCategories)
      .catch((error) => setMessage(readErrorMessage(error, "Could not load categories")));
    adminService
      .listDiscoverVideos()
      .then((data) => {
        setVideos(data.videos || []);
        if (data.categories?.length) setCategories(data.categories);
      })
      .catch((error) => setMessage(readErrorMessage(error, "Could not load videos")));
  };

  useEffect(() => {
    refresh();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const addCategory = async (event: FormEvent) => {
    event.preventDefault();
    setCategoryBusy(true);
    try {
      await adminService.createDiscoverCategory(categoryName);
      setCategoryName("");
      setMessage("Category created.");
      refresh();
    } catch (error) {
      setMessage(readErrorMessage(error, "Could not create category"));
    } finally { setCategoryBusy(false); }
  };

  const removeCategory = async (id: string) => {
    setCategoryBusy(true);
    try {
      await adminService.deleteDiscoverCategory(id);
      setMessage("Category deleted.");
      refresh();
    } catch (error) {
      setMessage(readErrorMessage(error, "Could not delete category"));
    } finally { setCategoryBusy(false); }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (editingId) {
        await adminService.updateDiscoverVideo(editingId, form);
        setMessage("Video updated.");
      } else {
        await adminService.createDiscoverVideo(form);
        setMessage("Video added to Discover.");
      }
      resetForm();
      refresh();
    } catch (error) {
      setMessage(readErrorMessage(error, "Failed to save video"));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: DiscoverVideoItem) => {
    setEditingId(item._id);
    setForm({
      title: item.title,
      creatorName: item.creatorName,
      category: item.category,
      youtubeUrl: item.youtubeUrl,
      description: item.description || "",
      sortOrder: item.sortOrder ?? 0,
      isActive: item.isActive !== false,
    });
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleActive = async (item: DiscoverVideoItem) => {
    setBusyId(item._id);
    setMessage(null);
    try {
      await adminService.updateDiscoverVideo(item._id, {
        isActive: !item.isActive,
      });
      refresh();
    } catch (error) {
      setMessage(readErrorMessage(error, "Failed to update status"));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: DiscoverVideoItem) => {
    if (!window.confirm(`Delete "${item.title}" from Discover?`)) return;
    setBusyId(item._id);
    setMessage(null);
    try {
      await adminService.deleteDiscoverVideo(item._id);
      setMessage("Video deleted.");
      if (editingId === item._id) resetForm();
      refresh();
    } catch (error) {
      setMessage(readErrorMessage(error, "Failed to delete video"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-normal text-teal-700">
          Content
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900">
          Discover Videos
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Videos and categories
        </p>
      </div>

      {message && (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
          {message}
        </p>
      )}

      <section className="border-b border-slate-200 pb-6">
        <h3 className="text-lg font-semibold">Content categories</h3>
        <form onSubmit={addCategory} className="mt-3 flex flex-wrap gap-2">
          <input aria-label="New category name" required maxLength={60}
            value={categoryName} onChange={e => setCategoryName(e.target.value)}
            placeholder="Category name" className="rounded-lg border border-slate-200 bg-white px-3 py-2" />
          <button disabled={categoryBusy} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">
            {categoryBusy ? "Saving..." : "Add category"}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {contentCategories.map(name => {
            const custom = customCategories.find(c => c.name === name);
            return <span key={name} className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-1.5 text-sm">
              {name}{custom && <button type="button" disabled={categoryBusy}
                onClick={() => removeCategory(custom._id)} title={`Delete ${name}`} aria-label={`Delete ${name}`}>
                <X className="h-4 w-4" />
              </button>}
            </span>;
          })}
        </div>
      </section>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">
            {editingId ? "Edit video" : "Add video"}
          </h3>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" /> Cancel edit
            </button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="block text-sm font-medium text-slate-800">
              Title
            </span>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Beauty tutorial — mascara tips"
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-amber-500/60"
            />
          </label>
          <label className="space-y-2">
            <span className="block text-sm font-medium text-slate-800">
              Creator name
            </span>
            <input
              required
              value={form.creatorName}
              onChange={(e) =>
                setForm({ ...form, creatorName: e.target.value })
              }
              placeholder="Mikayla Nogueira"
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-amber-500/60"
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="block text-sm font-medium text-slate-800">
              YouTube URL
            </span>
            <input
              required
              value={form.youtubeUrl}
              onChange={(e) =>
                setForm({ ...form, youtubeUrl: e.target.value })
              }
              placeholder="https://youtube.com/shorts/... or watch?v=..."
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-amber-500/60"
            />
          </label>
          <div className="space-y-2">
            <span className="block text-sm font-medium text-slate-800">
              Category
            </span>
            <CategoryCombobox
              kind="discover"
              allowCustom={false}
              value={form.category}
              onChange={(category) => setForm({ ...form, category })}
              placeholder="Search content category"
            />
          </div>
          <label className="space-y-2">
            <span className="block text-sm font-medium text-slate-800">
              Sort order
            </span>
            <input
              type="number"
              value={form.sortOrder ?? 0}
              onChange={(e) =>
                setForm({ ...form, sortOrder: Number(e.target.value) || 0 })
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-amber-500/60"
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="block text-sm font-medium text-slate-800">
              Description (shown under creator)
            </span>
            <textarea
              value={form.description || ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={2}
              placeholder="Short caption for the Discover card"
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-amber-500/60"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive !== false}
              onChange={(e) =>
                setForm({ ...form, isActive: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-200"
            />
            Active on Discover
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : editingId
                ? "Update video"
                : "Add to Discover"}
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-white text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Video</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {videos.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No Discover videos yet. Add a YouTube link above.
                </td>
              </tr>
            )}
            {videos.map((item) => (
              <tr key={item._id} className="align-top">
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      className="h-14 w-24 rounded-lg object-cover bg-slate-100"
                    />
                    <div>
                      <p className="font-medium text-slate-900">{item.title}</p>
                      <p className="text-xs text-slate-500">
                        {item.creatorName}
                      </p>
                      <a
                        href={item.youtubeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-teal-700 hover:underline"
                      >
                        Open YouTube <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700">{item.category}</td>
                <td className="px-4 py-3 text-slate-700">{item.sortOrder}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={busyId === item._id}
                    onClick={() => toggleActive(item)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      item.isActive
                        ? "bg-emerald-500/15 text-emerald-700"
                        : "bg-slate-700/60 text-slate-500"
                    }`}
                  >
                    {item.isActive ? "Active" : "Hidden"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-100"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item._id}
                      onClick={() => remove(item)}
                      className="rounded-lg border border-slate-200 p-2 text-rose-700 hover:bg-slate-100"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}


