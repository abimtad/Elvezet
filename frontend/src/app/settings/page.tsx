'use client';

import PageShell, { PageHeader } from '@/components/common/PageShell';
import ShopSelector from '@/components/common/ShopSelector';
import { useSelectedShop } from '@/components/common/SelectedShopContext';
import { Bell, Building2, LockKeyhole, Palette, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

const settingsCards = [
  { title: 'Payment account', description: 'Receiving account and payment instructions for receipt verification.', icon: Building2, href: '/settings/payments' },
  {
    title: 'Business Profile',
    description: 'Keep your shop identity, contact details, and brand presentation consistent across the platform.',
    icon: Building2,
    href: '/settings/branding',
  },
  {
    title: 'Notifications',
    href: '/settings/sms',
    description: 'Control booking alerts, review prompts, and owner reminders without leaving the operations shell.',
    icon: Bell,
  },
  {
    title: 'Security',
    description: 'Review access, authentication posture, and recovery preferences for the selected shop.',
    icon: ShieldCheck,
  },
  {
    title: 'Permissions',
    description: 'Prepare role-specific access rules for staff members, assistants, and future team managers.',
    icon: LockKeyhole,
  },
  {
    title: 'Appearance',
    description: 'This workspace now stays on the same light owner shell so style no longer snaps back after navigation.',
    icon: Palette,
  },
];

export default function SettingsPage() {
  const { selectedShopId, setSelectedShopId } = useSelectedShop();

  return (
    <PageShell>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Manage business preferences and operational controls without leaving the modern owner workspace."
        actions={<ShopSelector selectedShopId={selectedShopId} onSelect={setSelectedShopId} />}
      />

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {settingsCards.map((card) => {
          const content = (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#111b65]">
                <card.icon className="h-5 w-5 stroke-[1.8]" />
              </div>
              <h2 className="mt-5 text-lg font-semibold text-slate-900">{card.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{card.description}</p>
            </>
          );

          if ('href' in card && card.href) {
            return (
              <Link
                key={card.title}
                href={card.href}
                className="rounded-[28px] border border-[#eceff3] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:border-[#d9def8] hover:shadow-[0_12px_28px_rgba(17,27,101,0.08)]"
              >
                {content}
              </Link>
            );
          }

          return (
            <article
              key={card.title}
              className="rounded-[28px] border border-[#eceff3] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
            >
              {content}
            </article>
          );
        })}
      </section>
    </PageShell>
  );
}
