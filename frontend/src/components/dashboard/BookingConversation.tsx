'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, RefreshCw, Send } from 'lucide-react';
import api from '@/lib/axios';
import { useSession } from 'next-auth/react';

type ChatMessage = {
  _id: string;
  text?: string;
  image?: string;
  createdAt: string;
  senderId?: string;
  senderType?: 'human' | 'assistant';
  assistantCode?: string;
};

type PaymentGuidance = {
  bookingId: string;
  services?: string[];
  appointmentAt?: string;
  code: string;
  text: string;
  businessName: string;
  amount: number;
  currency: string;
  bank?: string | null;
  receivingAccount?: string | null;
  verificationStatus: string;
  bookingStatus: string;
  paymentStatus: string;
  receiptUrl?: string | null;
  actions?: string[];
  decision?: string;
};

function isAssistant(message: ChatMessage) {
  return message.senderType === 'assistant';
}

function decisionLabel(decision?: string) {
  switch (decision) {
    case 'approved':
      return 'Payment approved';
    case 'not_verified':
      return 'Payment not verified';
    case 'manual_review':
      return 'Payment under review';
    case 'checking':
      return 'Checking receipt…';
    default:
      return null;
  }
}

export default function BookingConversation({
  bookingId,
}: {
  bookingId: string;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const client = useQueryClient();
  const { data: session } = useSession();
  const accountKey = session?.user?.email || session?.devUserId || 'signed-out';
  const canLoad = Boolean(session?.accessToken || session?.devUserId);

  const conversationQuery = useQuery({
    queryKey: ['booking-conversation', accountKey, bookingId],
    queryFn: async () =>
      (await api.get(`/bookings/${bookingId}/conversation`)).data.data as {
        messages: ChatMessage[];
        guidance: PaymentGuidance;
      },
    refetchInterval: (query) => {
      const decision = query.state.data?.guidance?.decision;
      const status = query.state.data?.guidance?.verificationStatus;
      const checking =
        decision === 'checking' ||
        status === 'queued' ||
        status === 'verifying';
      const terminal =
        decision === 'approved' ||
        decision === 'not_verified' ||
        decision === 'manual_review' ||
        status === 'verified' ||
        status === 'failed' ||
        status === 'mismatch';
      // Keep human chat live even after bank verification has finished.
      return checking && !terminal ? 8000 : 12000;
    },
    enabled: canLoad,
    gcTime: 0,
  });

  useEffect(() => {
    setText('');
    setError('');
    setCopied(false);
  }, [accountKey, bookingId]);

  const guidance = conversationQuery.data?.guidance;
  const messages = conversationQuery.data?.messages;
  const canRefresh = guidance?.actions?.includes('refresh_verification');
  const resultLabel = decisionLabel(guidance?.decision);

  const whenLabel = useMemo(() => {
    if (!guidance?.appointmentAt) return 'Time TBD';
    const date = new Date(guidance.appointmentAt);
    if (Number.isNaN(date.getTime())) return 'Time TBD';
    return date.toLocaleString();
  }, [guidance?.appointmentAt]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/bookings/${bookingId}/messages`, { text: text.trim() });
      setText('');
      await client.invalidateQueries({
        queryKey: ['booking-conversation', accountKey, bookingId],
      });
    } catch {
      setError('Message not sent. Please retry.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus() {
    if (!canRefresh) return;
    try {
      await api.post(`/bookings/${bookingId}/payment-verification/refresh`);
      await client.invalidateQueries({
        queryKey: ['booking-conversation', accountKey, bookingId],
      });
    } catch {
      setError('Could not refresh payment status.');
    }
  }

  async function copyAccount() {
    if (!guidance?.receivingAccount) return;
    try {
      await navigator.clipboard.writeText(guidance.receivingAccount);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Could not copy account number.');
    }
  }

  return (
    <section className="mt-5 border-t border-slate-200 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Conversation</h3>
        {canRefresh ? (
          <button
            type="button"
            onClick={() => void refreshStatus()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            Refresh status
          </button>
        ) : null}
      </div>

      {guidance ? (
        <div className="mb-4 rounded-2xl border border-white/50 bg-white/40 p-4 shadow-sm backdrop-blur-xl">
          <p className="text-sm font-semibold text-slate-900">
            {guidance.businessName}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {(guidance.services || []).join(', ') || 'Service'} · {whenLabel}
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-900">
            {Number(guidance.amount || 0).toLocaleString()}{' '}
            {guidance.currency || 'ETB'}
          </p>
          {guidance.text ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {guidance.text}
            </p>
          ) : null}
          {resultLabel ? (
            <p
              className={`mt-2 text-sm font-semibold ${
                guidance.decision === 'approved'
                  ? 'text-emerald-700'
                  : guidance.decision === 'not_verified'
                    ? 'text-rose-700'
                    : 'text-amber-700'
              }`}
            >
              {resultLabel}
            </p>
          ) : null}
          {guidance.receivingAccount ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white/50 px-3 py-2.5">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {guidance.bank || 'Receiving account'}
                </p>
                <p className="font-semibold tracking-wide text-slate-900">
                  {guidance.receivingAccount}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyAccount()}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-white"
              >
                <Copy size={14} />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm font-medium text-amber-700">
              Receiving account is not configured for this business.
            </p>
          )}
        </div>
      ) : null}

      {conversationQuery.isError && (
        <button
          type="button"
          className="mb-3 text-sm text-rose-700 underline"
          onClick={() => {
            void conversationQuery.refetch();
          }}
        >
          Could not load conversation. Retry
        </button>
      )}

      <ol className="my-3 max-h-72 space-y-3 overflow-y-auto rounded-2xl border border-white/40 bg-white/25 p-3 backdrop-blur-xl">
        {messages?.map((m) => {
          const assistant = isAssistant(m);
          const result =
            m.assistantCode === 'payment_approved' ||
            m.assistantCode === 'payment_not_verified' ||
            m.assistantCode === 'payment_review';
          return (
            <li
              key={m._id}
              className={`rounded-2xl px-3 py-2.5 ${
                assistant
                  ? 'bg-white/40'
                  : 'border border-white/40 bg-white/60'
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {assistant
                  ? result
                    ? 'Payment update'
                    : 'Booking assistant'
                  : 'Participant'}
              </p>
              {m.text ? (
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">
                  {m.text}
                </p>
              ) : null}
              {m.image ? (
                <PrivateReceipt
                  key={m.image}
                  image={m.image}
                  bookingId={bookingId}
                />
              ) : null}
              <time className="mt-1 block text-xs text-slate-400">
                {new Date(m.createdAt).toLocaleString()}
              </time>
            </li>
          );
        })}
      </ol>

      <form onSubmit={(e) => void send(e)} className="flex gap-2">
        <input
          aria-label="Message"
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Reply to the customer…"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm outline-none focus:border-slate-400"
        />
        <button
          title="Send message"
          aria-label="Send message"
          disabled={busy || !text.trim()}
          className="rounded-xl bg-slate-900 px-3 text-white disabled:opacity-50"
        >
          <Send size={18} />
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function PrivateReceipt({
  image,
  bookingId,
}: {
  image: string;
  bookingId: string;
}) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    let path: string;
    try {
      path = new URL(image, window.location.origin).pathname;
    } catch {
      setError(true);
      return;
    }
    if (!path.startsWith(`/uploads/booking-screenshots/${bookingId}/`)) {
      setError(true);
      return;
    }
    const origin = new URL(api.defaults.baseURL!, window.location.origin)
      .origin;
    api
      .get(`${origin}${path}`, { responseType: 'blob' })
      .then((response) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(response.data);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image, bookingId]);
  if (error) return <p>Receipt preview unavailable</p>;
  if (!url) return <p>Loading receipt…</p>;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img
        src={url}
        alt="Payment receipt"
        className="mt-2 max-h-64 max-w-full object-contain"
      />
    </a>
  );
}
