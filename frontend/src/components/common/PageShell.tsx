'use client';

import Sidebar from './Sidebar';

export default function PageShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-[#f8f9fa] text-slate-900">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-[#f8f9fa] px-4 py-4 lg:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[#eceff3] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400">{eyebrow}</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{description}</p>
        </div>
        {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}
