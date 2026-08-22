'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Calendar,
  Users,
  Scissors,
  Boxes,
  UserRoundSearch,
  LogOut,
  Star,
  Settings,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBusinesses } from '@/hooks/useBusiness';
import { Business } from '@/types';
import { authService } from '@/services/auth.service';
import { useSelectedShop } from './SelectedShopContext';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Bookings', href: '/bookings', icon: Calendar },
  { name: 'Clients', href: '/clients', icon: UserRoundSearch },
  { name: 'Staff', href: '/staff', icon: Users, hideForIndependent: true },
  { name: 'Team', href: '/team', icon: Users, hideForIndependent: true },
  { name: 'Inventory', href: '/inventory', icon: Boxes },
  { name: 'Services', href: '/services', icon: Scissors },
  { name: 'Reviews', href: '/reviews', icon: Star },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: businesses } = useBusinesses();
  const { selectedShopId } = useSelectedShop();

  const businessList = Array.isArray((businesses as any)?.data)
    ? ((businesses as any).data as Business[])
    : ((Array.isArray(businesses) ? businesses : []) as Business[]);

  const selectedBusiness =
    businessList.find((business) => business.id === selectedShopId || business._id === selectedShopId) ||
    businessList[0];

  const isIndependent = selectedBusiness?.type === 'independent';

  const filteredNavigation = isIndependent
    ? navigation.filter((item) => !item.hideForIndependent)
    : navigation;

  return (
    <div className="flex h-full w-20 flex-col border-r border-[#e5e7eb] bg-white">
      <div className="flex h-18 items-center justify-center border-b border-[#eceff3]">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#111b65] shadow-sm">
          <Scissors className="h-4 w-4 text-white" />
        </div>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {filteredNavigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              title={item.name}
              className={cn(
                'group flex h-12 items-center justify-center rounded-2xl border transition-all duration-150',
                isActive
                  ? 'border-[#d9def8] bg-[#f1f4ff] text-[#111b65] shadow-sm'
                  : 'border-transparent text-slate-400 hover:border-[#eceff3] hover:bg-[#f8fafc] hover:text-slate-700',
              )}
            >
              <item.icon
                className={cn(
                  'h-[18px] w-[18px] flex-shrink-0 stroke-[1.7] transition-colors',
                  isActive ? 'text-[#111b65]' : 'text-slate-500 group-hover:text-slate-700',
                )}
                aria-hidden="true"
              />
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[#eceff3] p-3">
        <button
          onClick={() => void authService.signOut()}
          title="Logout"
          className="flex h-12 w-full items-center justify-center rounded-2xl border border-transparent text-slate-400 transition-all hover:border-rose-100 hover:bg-rose-50 hover:text-rose-500"
        >
          <LogOut className="h-[18px] w-[18px] stroke-[1.7]" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
