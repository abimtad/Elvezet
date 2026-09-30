"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import Image from "next/image";
import api from "@/lib/axios";
import { businessPosterPolicy, inspectPosterFile } from "@/lib/business-poster-image";

type Poster = { _id: string; title: string; imageUrl: string; placement: "home" | "clients" | "both"; audience: "staff" | "independent" | "both"; isActive: boolean; sortOrder: number; startAt: string | null; endAt: string | null; linkUrl: string };
const initial = { title: "", placement: "both" as Poster["placement"], audience: "both" as Poster["audience"], isActive: true, sortOrder: 0, startAt: "", endAt: "", linkUrl: "" };
const localTime = (value: string | null) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
const message = (e: unknown) => axios.isAxiosError(e) ? e.response?.data?.message || "Unable to save posters. Please try again." : e instanceof Error ? e.message : "Unable to load posters.";
const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

function PosterPreview({ src, alt }: { src: string; alt: string }) {
  return <div className="relative w-full overflow-hidden rounded-[30px] bg-slate-100"
    style={{ aspectRatio: `${businessPosterPolicy.referenceWidth} / ${businessPosterPolicy.referenceHeight}` }}>
    <Image unoptimized fill sizes="(max-width: 768px) 100vw, 448px" src={src} alt={alt} className="object-cover" />
  </div>;
}

export default function BusinessPostersPage() {
  const [items, setItems] = useState<Poster[]>([]);
  const [form, setForm] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingImage, setCheckingImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const imageSelection = useRef({ version: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());
  async function load() { const response = await api.get("/admin/business-posters"); setItems(response.data.data); }
  useEffect(() => {
    const controller = new AbortController();
    const selectionState = imageSelection.current;
    api.get("/admin/business-posters", { signal: controller.signal })
      .then(response => setItems(response.data.data))
      .catch(e => { if (!controller.signal.aborted) setError(message(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { selectionState.version++; controller.abort(); window.clearInterval(timer); };
  }, []);
  useEffect(() => () => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);
  function clearImage() {
    imageSelection.current.version++; setCheckingImage(false); setImageError("");
    setFile(null); setPreview(items.find(p => p._id === editing)?.imageUrl || "");
  }
  function reset() {
    imageSelection.current.version++; setCheckingImage(false); setImageError("");
    setEditing(null); setForm(initial); setFile(null); setPreview("");
  }
  async function selectImage(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const selected = input.files?.[0];
    const selection = ++imageSelection.current.version;
    setFile(null); setImageError(""); setPreview("");
    if (!selected) { setCheckingImage(false); setPreview(items.find(p => p._id === editing)?.imageUrl || ""); return; }
    setCheckingImage(true);
    try {
      await inspectPosterFile(selected);
      if (selection !== imageSelection.current.version) return;
      setFile(selected); setPreview(URL.createObjectURL(selected));
    } catch (error) {
      if (selection !== imageSelection.current.version) return;
      input.value = ""; setImageError(message(error));
    } finally { if (selection === imageSelection.current.version) setCheckingImage(false); }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(""); setNotice("");
    if (checkingImage || imageError) return;
    if (!file && !editing) { setError("Choose a poster image."); return; }
    if (form.startAt && form.endAt && new Date(form.endAt) <= new Date(form.startAt)) { setError("End time must be after start time."); return; }
    setBusy(true);
    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => body.append(key, key === "startAt" || key === "endAt" ? value ? new Date(String(value)).toISOString() : "" : String(value)));
    if (file) body.append("image", file);
    try {
      await api.request({ method: editing ? "PATCH" : "POST", url: `/admin/business-posters${editing ? `/${editing}` : ""}`, data: body, headers: { "Content-Type": "multipart/form-data" } });
      reset(); setNotice("Poster saved.");
      try { await load(); } catch { setError("Saved, but the list could not refresh. Reload this page."); }
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  async function remove(item: Poster) {
    if (!window.confirm(`Delete “${item.title}”?`)) return;
    setBusy(true); setError(""); setNotice("");
    try { await api.delete(`/admin/business-posters/${item._id}`); if (editing === item._id) reset(); setItems(items.filter(p => p._id !== item._id)); setNotice("Poster deleted."); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold">Business app posters</h1><p className="mt-2 text-sm text-slate-600">Control the top cards on Staff and Independent Home and Clients pages. Choose audience and placement. Lower order numbers appear first. Up to 20 active posters appear per page. Existing posters without an audience keep showing in both apps.</p></div>
    {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-md bg-teal-50 p-3 text-teal-800">{notice}</p>}
    <form onSubmit={save} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-2">
      <h2 className="font-semibold md:col-span-2">{editing ? "Edit poster" : "Add poster"}</h2>
      <label className="space-y-1 text-sm">Title / image description<input required maxLength={120} className={input} value={form.title} disabled={busy} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
      <label className="space-y-1 text-sm">Show on<select className={input} disabled={busy} value={form.placement} onChange={e => setForm({ ...form, placement: e.target.value as Poster["placement"] })}><option value="both">Home and Clients</option><option value="home">Home only</option><option value="clients">Clients only</option></select></label>
      <label className="space-y-1 text-sm">Audience<select className={input} disabled={busy} value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value as Poster["audience"] })}><option value="both">Staff and Independent</option><option value="staff">Staff only</option><option value="independent">Independent only</option></select></label>
      <label className="space-y-1 text-sm">Start (your local time, optional)<input type="datetime-local" className={input} disabled={busy} value={form.startAt} onChange={e => setForm({ ...form, startAt: e.target.value })} /></label>
      <label className="space-y-1 text-sm">End (your local time, optional)<input type="datetime-local" className={input} disabled={busy} value={form.endAt} onChange={e => setForm({ ...form, endAt: e.target.value })} /></label>
      <label className="space-y-1 text-sm">Display order<input type="number" min={0} max={9999} required className={input} disabled={busy} value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: Number(e.target.value) })} /></label>
      <label className="space-y-1 text-sm">Tap link (HTTPS, optional)<input type="url" maxLength={2048} className={input} disabled={busy} value={form.linkUrl} onChange={e => setForm({ ...form, linkUrl: e.target.value })} /></label>
      <label className="space-y-1 text-sm">Poster image
        <input key={editing || `new-${notice}`} type="file" accept="image/jpeg,image/png,image/webp" className={input} disabled={busy} onChange={e => void selectImage(e)} />
        <span className="block text-xs text-slate-500">JPEG, PNG or WebP, up to 5 MB. Recommended: 1774 × 637. Poster proportions may differ by at most 25%; anything beyond this is rejected. Images fill the frame with a centred crop, exactly as shown below. No end date means until disabled.</span>
      </label>
      {checkingImage && <p role="status" className="text-sm text-slate-600 md:col-span-2">Checking image size and proportions…</p>}
      {imageError && <div className="md:col-span-2"><p role="alert" className="text-sm text-red-700">{imageError}</p><button type="button" onClick={clearImage} className="mt-2 text-sm text-teal-700">{editing ? "Keep current image" : "Clear image"}</button></div>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />Enabled</label>
      {preview && <div className="md:col-span-2"><p className="mb-2 text-sm">Phone preview — this is how the poster will fill the banner</p><div className="max-w-md"><PosterPreview src={preview} alt={form.title || "Poster preview"} /></div></div>}
      <div className="flex gap-3 md:col-span-2"><button disabled={busy || checkingImage || !!imageError} className="rounded-md bg-teal-700 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "Saving…" : "Save poster"}</button>{editing && <button type="button" disabled={busy} onClick={reset} className="rounded-md border px-4 py-2 text-sm">Cancel edit</button>}</div>
    </form>
    {loading ? <p>Loading posters…</p> : items.length === 0 ? <p className="text-sm text-slate-500">No posters yet. Staff see their original cards.</p> : <div className="grid gap-4 md:grid-cols-2">{items.map(item => {
      const state = !item.isActive ? "Disabled" : item.endAt && Date.parse(item.endAt) <= now ? "Expired" : item.startAt && Date.parse(item.startAt) > now ? "Scheduled" : "Active";
      const audienceLabel = item.audience === "staff" ? "Staff" : item.audience === "independent" ? "Independent" : "Staff + Independent";
      return <article key={item._id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><PosterPreview src={item.imageUrl} alt={item.title} /><div className="flex justify-between gap-3"><h2 className="font-semibold">{item.title}</h2><span className="text-sm text-slate-500">{state}</span></div><p className="text-sm text-slate-500">{item.placement === "both" ? "Home and Clients" : item.placement} · {audienceLabel} · Order {item.sortOrder}</p><p className="text-xs text-slate-500">{item.startAt ? new Date(item.startAt).toLocaleString() : "Immediately"} → {item.endAt ? new Date(item.endAt).toLocaleString() : "Until disabled"}</p><div className="flex gap-4 text-sm"><button disabled={busy} onClick={() => { imageSelection.current.version++; setCheckingImage(false); setImageError(""); setEditing(item._id); setFile(null); setPreview(item.imageUrl); setForm({ title: item.title, placement: item.placement, audience: item.audience || "both", isActive: item.isActive, sortOrder: item.sortOrder, startAt: localTime(item.startAt), endAt: localTime(item.endAt), linkUrl: item.linkUrl }); }} className="text-teal-700">Edit / disable</button><button disabled={busy} onClick={() => void remove(item)} className="text-red-600">Delete</button></div></article>;
    })}</div>}
  </div>;
}
