"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";

export default function AccountDeletionPage() {
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1'}/account-deletion-requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact: contact.trim() }) });
      if (!response.ok) throw new Error();
      setSent(true); setContact("");
    } catch { setError("Could not submit your request. Please try again later."); }
    finally { setBusy(false); }
  };
  return <main className="min-h-screen bg-white px-6 py-12 text-slate-900"><div className="mx-auto max-w-xl space-y-6">
    <h1 className="text-3xl font-semibold">Delete Your BarberOS Account</h1>
    <p>In the customer app, open Profile, then Delete account. You can also request deletion below without installing the app. We verify ownership using your registered email or phone before deleting any account.</p>
    <p>Your profile, reviews, messages, device tokens and preferences are removed. Unpaid bookings are removed and owned businesses are closed. Paid transaction records are unlinked and retained for up to 24 months for refunds and disputes; deletion does not automatically refund payments.</p>
    {sent ? <p role="status" className="border-l-4 border-teal-700 p-4">Request received. Support will contact you to verify account ownership.</p> : <form onSubmit={submit} className="space-y-4"><label className="block text-sm font-medium">Registered email or phone<input required minLength={5} maxLength={200} autoComplete="username" value={contact} onChange={e => setContact(e.target.value)} className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-3" /></label>{error && <p role="alert" className="text-red-700">{error}</p>}<button disabled={busy} className="rounded-md bg-red-700 px-4 py-3 text-white disabled:opacity-50">{busy ? 'Submitting...' : 'Request account deletion'}</button></form>}
    <Link href="/privacy" className="inline-block text-teal-800 underline">Privacy policy</Link>
  </div></main>;
}
