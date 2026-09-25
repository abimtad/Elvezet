'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import PageShell, { PageHeader } from '@/components/common/PageShell';
import ShopSelector from '@/components/common/ShopSelector';
import { useSelectedShop } from '@/components/common/SelectedShopContext';
import api from '@/lib/axios';

export default function PaymentSettings() {
  const { selectedShopId, setSelectedShopId } = useSelectedShop();
  const query = useQuery({
    queryKey: ['payment-account', selectedShopId],
    enabled: !!selectedShopId,
    queryFn: async () => (await api.get(`/businesses/${selectedShopId}`)).data.data,
  });
  const [account, setAccount] = useState('');
  const [bank, setBank] = useState('telebirr');
  const [instructions, setInstructions] = useState('');
  const [requirePrepayment, setRequirePrepayment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setAccount(query.data?.settlementAccount || '');
    setBank(query.data?.settlementBank || 'telebirr');
    setInstructions(query.data?.paymentInstructions || '');
    setRequirePrepayment(Boolean(query.data?.requirePrepayment));
    setMessage('');
  }, [query.data, selectedShopId]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await api.patch(`/businesses/${selectedShopId}`, {
        settlementAccount: account,
        settlementBank: bank,
        paymentInstructions: instructions,
        requirePrepayment,
      });
      await query.refetch();
      setMessage('Payment account saved.');
    } catch {
      setMessage('Could not save the payment account. Please retry.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Configuration"
        title="Payment account"
        description="Receiving account for Verify.ET receipt checks"
        actions={
          <ShopSelector
            selectedShopId={selectedShopId}
            onSelect={setSelectedShopId}
          />
        }
      />
      {query.isError ? (
        <button onClick={() => void query.refetch()}>Could not load. Retry</button>
      ) : selectedShopId && !query.isLoading ? (
        <form onSubmit={(e) => void save(e)} className="max-w-xl space-y-5 py-6">
          <label className="block">
            Bank or wallet
            <select
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              className="mt-2 block w-full rounded border p-3"
            >
              {[
                'telebirr',
                'cbe',
                'boa',
                'mpesa',
                'cbebirr',
                'dashen',
                'awash',
                'siinqee',
                'kaafiebirr',
                'coopayebirr',
              ].map((b) => (
                <option key={b} value={b}>
                  {b.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Receiving account or wallet number
            <input
              required
              maxLength={80}
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="mt-2 block w-full rounded border p-3"
            />
          </label>
          <label className="block">
            Payment instructions
            <textarea
              maxLength={1000}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="mt-2 block w-full rounded border p-3"
              rows={3}
            />
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={requirePrepayment}
              onChange={(e) => setRequirePrepayment(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Require prepayment</span>
              <span className="mt-1 block text-sm text-gray-600">
                Keep online bookings pending until Verify.ET confirms the receipt.
              </span>
            </span>
          </label>
          <button
            disabled={busy}
            className="flex items-center gap-2 rounded bg-teal-700 px-4 py-2 text-white"
          >
            <Save size={16} />
            {busy ? 'Saving...' : 'Save'}
          </button>
        </form>
      ) : (
        <p>{selectedShopId ? 'Loading...' : 'Select a business.'}</p>
      )}
      {message && <p role="status">{message}</p>}
    </PageShell>
  );
}
