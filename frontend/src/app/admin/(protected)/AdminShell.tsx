"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  Plus,
  Scissors,
  ShieldCheck,
  Tags,
  Users,
  Video,
} from "lucide-react";
import { authService } from "@/services/auth.service";

const navItems = [
  { href: "/admin/applications", label: "Applications", icon: Users },
  { href: "/admin/overview", label: "Overview", icon: BarChart3 },
  { href: "/admin/tenants", label: "Businesses", icon: Building2 },
  { href: "/admin/verification-queue", label: "Verification", icon: ShieldCheck },
  { href: "/admin/categories", label: "Business categories", icon: Tags },
  { href: "/admin/discover", label: "Discover content", icon: Video },
  { href: "/admin/business-posters", label: "Business posters", icon: Video },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/safety", label: "Safety & Privacy", icon: ShieldCheck },
  { href: "/admin/sms", label: "SMS subscriptions", icon: ShieldCheck },
  { href: "/admin/onboard", label: "Add business", icon: Plus },
];

type AdminShellProps = {
  children: React.ReactNode;
  identityLabel?: string;
};

export default function AdminShell({ children, identityLabel }: AdminShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#f5f7f8] text-slate-900 lg:flex">
      <aside className="border-b border-slate-200 bg-white p-4 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r lg:p-5">
        <Link href="/admin/overview" className="flex items-center gap-3 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-700 text-white">
            <Scissors size={20} />
          </span>
          <span className="text-xl font-semibold">
            BarberOS
            <span className="block text-xs font-medium text-slate-500">
              Administration
            </span>
          </span>
        </Link>
        <nav aria-label="Admin navigation" className="mt-5 flex gap-1 overflow-x-auto lg:flex-col">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-teal-50 text-teal-800"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/"
          className="mt-8 flex items-center gap-2 border-t border-slate-200 pt-5 text-sm text-slate-500"
        >
          <ArrowUpRight size={16} />
          Business dashboard
        </Link>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 lg:px-8">
          <span className="text-sm font-medium">
            {navItems.find((item) => item.href === pathname)?.label ||
              "Administration"}
          </span>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {identityLabel ? (
              <span className="hidden max-w-[220px] truncate sm:inline" title={identityLabel}>
                {identityLabel}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() =>
                void authService.signOut({ redirectTo: "/admin/signin" })
              }
              className="rounded-md border border-slate-200 px-2.5 py-1.5 font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              Sign out and use another account
            </button>
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={16} />
              Admin workspace
            </span>
          </div>
        </header>
        <main className="admin-workspace mx-auto max-w-7xl px-5 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
