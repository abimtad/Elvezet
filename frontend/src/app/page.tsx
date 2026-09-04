'use client';

import Sidebar from '@/components/common/Sidebar';
import ShopSelector from '@/components/common/ShopSelector';
import { useSelectedShop } from '@/components/common/SelectedShopContext';
import { authService } from '@/services/auth.service';
import { businessService } from '@/services/business.service';
import { dashboardService } from '@/services/dashboard.service';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Lock,
  LockOpen,
  Moon,
  Plus,
  Search,
  UserRound,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragMoveEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import ClientDrawer from '@/components/dashboard/ClientDrawer';
import EndOfDayModal from '@/components/dashboard/EndOfDayModal';
import WalkInDrawer, { type WalkInSubmitData } from '@/components/dashboard/WalkInDrawer';
import AppointmentDetailDrawer, { type DetailBooking } from '@/components/dashboard/AppointmentDetailDrawer';
import CheckoutDrawer from '@/components/dashboard/CheckoutDrawer';
import type { PaymentMethodId } from '@/components/dashboard/PaymentMethodPicker';
import type { AppointmentSavePayload } from '@/components/dashboard/AppointmentDetailDrawer';
import axios from 'axios';
import { normalizeServiceIdsField } from '@/lib/bookingUtils';
import { getDashboardSocket } from '@/lib/realtime';

type CurrentUser = {
  _id?: string;
  firebaseUid?: string;
  fullName?: string;
  roles?: string[];
  needsPasswordReset?: boolean;
};

type BookingRealtimePayload = {
  bookingId?: string;
  businessId?: string;
  staffId?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
};

type StaffMember = {
  _id?: string;
  staffId?: string;
  userId?: {
    fullName?: string;
    email?: string;
    roles?: string[];
    firebaseUid?: string;
    profilePicture?: string;
  };
  services?: Array<{
    _id?: string;
    name?: string;
    duration?: number;
    basePrice?: number;
    category?: string;
    categoryName?: string;
  }>;
};

type ServiceItem = {
  _id: string;
  name: string;
  duration: number;
  basePrice: number;
  category?: string;
  categoryName?: string;
};

type BookingItem = {
  _id: string;
  startTime: string;
  endTime: string;
  status: string;
  computedStatus?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  totalAmount?: number;
  isWalkIn?: boolean;
  appointmentNotes?: string;
  tipAmount?: number;
  clientId?: {
    _id?: string;
    fullName?: string;
    phoneNumber?: string;
  };
  serviceIds?: Array<{
    _id?: string;
    name?: string;
    duration?: number;
    basePrice?: number;
    category?: string;
    categoryName?: string;
  }>;
  staffId?:
    | string
    | {
        _id?: string;
        userId?: {
          fullName?: string;
          profilePicture?: string;
          firebaseUid?: string;
        };
      };
};

const resolveBookingStaffKey = (staffId: BookingItem['staffId']): string => {
  if (!staffId) return '';
  if (typeof staffId === 'string') return staffId;
  return String(staffId._id || staffId.userId?.firebaseUid || '');
};

const resolveStaffColumnId = (staff: StaffMember): string => {
  return String(staff.staffId || staff.userId?.firebaseUid || '');
};

type ProductItem = {
  _id: string;
  name: string;
  brand?: string;
  price: number;
  stockQuantity: number;
  minStockAlert: number;
};

type WalkInDrawerState = {
  open: boolean;
  staffId: string;
  startMinutes: number;
};

type CheckoutState = {
  open: boolean;
  booking: BookingItem | null;
};

type AppointmentDetailState = {
  open: boolean;
  booking: BookingItem | null;
};

type VisibleStaff = {
  id: string;
  name: string;
  avatarUrl?: string;
  presenceStatus?: 'online' | 'offline' | 'busy';
  userId?: {
    firebaseUid?: string;
  };
};

const presenceDotClass = (status?: 'online' | 'offline' | 'busy') => {
  if (status === 'busy') return 'bg-rose-500 ring-rose-100';
  if (status === 'offline') return 'bg-slate-400 ring-slate-100';
  return 'bg-emerald-500 ring-emerald-100';
};

const presenceLabel = (status?: 'online' | 'offline' | 'busy') => {
  if (status === 'busy') return 'Busy';
  if (status === 'offline') return 'Offline';
  return 'Online';
};

const DEFAULT_START_MINUTES = 9 * 60;
const DEFAULT_END_MINUTES = 18 * 60;
const GUTTER_WIDTH = 84;
const STAFF_COLUMN_WIDTH = 280;
const PX_PER_15_MINUTES = 25;
const PX_PER_MINUTE = PX_PER_15_MINUTES / 15;
const GRID_INTERVAL_MINUTES = 15;

const CATEGORY_STYLES: Record<
  string,
  {
    shell: string;
    border: string;
    badge: string;
    accent: string;
  }
> = {
  general: {
    shell: 'bg-sky-100/90 text-slate-800',
    border: 'border-sky-200/90',
    badge: 'bg-sky-500/10 text-sky-700',
    accent: 'bg-sky-400',
  },
  haircut: {
    shell: 'bg-sky-100/90 text-slate-800',
    border: 'border-sky-200/90',
    badge: 'bg-sky-500/10 text-sky-700',
    accent: 'bg-sky-400',
  },
  nails: {
    shell: 'bg-emerald-100/90 text-slate-800',
    border: 'border-emerald-200/90',
    badge: 'bg-emerald-500/10 text-emerald-700',
    accent: 'bg-emerald-400',
  },
  pedicure: {
    shell: 'bg-emerald-100/90 text-slate-800',
    border: 'border-emerald-200/90',
    badge: 'bg-emerald-500/10 text-emerald-700',
    accent: 'bg-emerald-400',
  },
  manicure: {
    shell: 'bg-lime-100/90 text-slate-800',
    border: 'border-lime-200/90',
    badge: 'bg-lime-500/10 text-lime-700',
    accent: 'bg-lime-400',
  },
  balayage: {
    shell: 'bg-amber-100/95 text-slate-800',
    border: 'border-amber-200/90',
    badge: 'bg-amber-500/10 text-amber-700',
    accent: 'bg-amber-400',
  },
  color: {
    shell: 'bg-amber-100/95 text-slate-800',
    border: 'border-amber-200/90',
    badge: 'bg-amber-500/10 text-amber-700',
    accent: 'bg-amber-400',
  },
  ombre: {
    shell: 'bg-zinc-200/90 text-slate-800',
    border: 'border-zinc-300/90',
    badge: 'bg-zinc-700/10 text-zinc-700',
    accent: 'bg-zinc-500',
  },
  botox: {
    shell: 'bg-violet-200/90 text-slate-800',
    border: 'border-violet-300/90',
    badge: 'bg-violet-500/10 text-violet-700',
    accent: 'bg-violet-400',
  },
  facial: {
    shell: 'bg-violet-200/90 text-slate-800',
    border: 'border-violet-300/90',
    badge: 'bg-violet-500/10 text-violet-700',
    accent: 'bg-violet-400',
  },
  process: {
    shell: 'bg-rose-200/90 text-slate-800',
    border: 'border-rose-300/90',
    badge: 'bg-rose-500/10 text-rose-700',
    accent: 'bg-rose-400',
  },
  treatment: {
    shell: 'bg-rose-200/90 text-slate-800',
    border: 'border-rose-300/90',
    badge: 'bg-rose-500/10 text-rose-700',
    accent: 'bg-rose-400',
  },
};

/** Checked-out / paid appointments — muted, elegant “slot is done” look */
const FINISHED_CARD_STYLE = {
  shell:
    'bg-gradient-to-br from-slate-100/95 via-slate-50/90 to-zinc-100/80 text-slate-500',
  border: 'border-slate-200/90',
  badge: 'bg-slate-200/60 text-slate-500 ring-1 ring-slate-200/80',
  accent: 'bg-slate-300/90',
};

const timeStringToMinutes = (t: string | undefined): number | null => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + (m || 0);
};

const todayInputValue = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

const formatDisplayDate = (value: string): string => {
  const parsed = new Date(`${value}T00:00:00`);
  return parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const minutesToLabel = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHours}:${String(mins).padStart(2, '0')} ${suffix}`;
};

const parseDateAndMinutes = (dateValue: string, minutes: number): Date => {
  const [year, month, day] = dateValue.split('-').map(Number);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return new Date(year, month - 1, day, hour, minute, 0, 0);
};

const toMinutes = (value: string | Date): number => {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
};

const buildSlots = (startMinutes: number, endMinutes: number, slotMinutes: number): number[] =>
  Array.from(
    { length: Math.floor((endMinutes - startMinutes) / slotMinutes) + 1 },
    (_, i) => startMinutes + i * slotMinutes,
  );

const minuteToTop = (minutes: number, gridStartMinutes: number): number =>
  (minutes - gridStartMinutes) * PX_PER_MINUTE;

const bookingTitle = (booking: BookingItem): string => {
  const serviceNames = (booking.serviceIds || [])
    .map((service) => service.name)
    .filter(Boolean)
    .join(', ');
  return serviceNames || 'Booking';
};

const bookingCustomer = (booking: BookingItem): string => {
  return booking.clientId?.fullName || (booking.isWalkIn ? 'Walk-in' : 'Customer');
};

const bookingCategory = (booking: BookingItem): string => {
  const firstCategory =
    booking.serviceIds?.find((service) => service.category)?.category ||
    booking.serviceIds?.find((service) => service.categoryName)?.categoryName ||
    bookingTitle(booking);

  return String(firstCategory || 'general').toLowerCase();
};

const bookingCategoryLabel = (booking: BookingItem): string => {
  return (
    booking.serviceIds?.find((service) => service.categoryName)?.categoryName ||
    booking.serviceIds?.find((service) => service.category)?.category ||
    'General'
  );
};

const isBookingFinished = (booking: BookingItem): boolean =>
  String(booking.paymentStatus || '').toLowerCase() === 'paid';

const resolveBookingCardStyle = (booking: BookingItem) => {
  if (isBookingFinished(booking)) {
    return FINISHED_CARD_STYLE;
  }
  return resolveCategoryStyle(bookingCategory(booking));
};

const isBookingReschedulable = (booking: BookingItem): boolean => {
  if (isBookingFinished(booking)) return false;
  // Keep drag enabled for historical/no-show cards so owners can recover and
  // move them to a valid slot. Backend still enforces final permissions/validity.
  const blockedStates = new Set(['cancelled', 'expired']);
  const status = String(booking.status || '').toLowerCase();
  const computed = String(booking.computedStatus || '').toLowerCase();
  return !blockedStates.has(status) && !blockedStates.has(computed);
};

const resolveCategoryStyle = (categoryKey: string) => {
  const normalized = categoryKey.toLowerCase();
  if (CATEGORY_STYLES[normalized]) {
    return CATEGORY_STYLES[normalized];
  }

  if (normalized.includes('hair') || normalized.includes('cut') || normalized.includes('shave')) {
    return CATEGORY_STYLES.haircut;
  }
  if (normalized.includes('pedi') || normalized.includes('mani') || normalized.includes('nail')) {
    return CATEGORY_STYLES.pedicure;
  }
  if (normalized.includes('balayage') || normalized.includes('color')) {
    return CATEGORY_STYLES.balayage;
  }
  if (normalized.includes('ombre')) {
    return CATEGORY_STYLES.ombre;
  }
  if (normalized.includes('botox') || normalized.includes('facial')) {
    return CATEGORY_STYLES.botox;
  }
  if (normalized.includes('process') || normalized.includes('treatment')) {
    return CATEGORY_STYLES.process;
  }

  return CATEGORY_STYLES.general;
};

const avatarFallback = (name: string): string =>
  name
    .split(' ')
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

type DraggableBookingCardProps = {
  booking: BookingItem;
  editMode: boolean;
  canDrag: boolean;
  finished: boolean;
  style: {
    shell: string;
    border: string;
    badge: string;
    accent: string;
  };
  top: number;
  height: number;
  startMinutes: number;
  endMinutes: number;
  onCardClick: (booking: BookingItem) => void;
  children: React.ReactNode;
};

function DraggableBookingCard({
  booking,
  editMode,
  canDrag,
  finished,
  style,
  top,
  height,
  onCardClick,
  children,
}: DraggableBookingCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: booking._id,
    disabled: !editMode || !canDrag,
  });

  const transformStyle = transform ? CSS.Translate.toString(transform) : undefined;

  return (
    <div
      ref={setNodeRef}
      {...(editMode && canDrag ? { ...listeners, ...attributes } : {})}
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        if (isDragging) return;
        onCardClick(booking);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onCardClick(booking);
        }
      }}
      className={cn(
        'absolute left-1.5 right-1.5 z-10 overflow-hidden rounded-[14px] border p-1 text-left transition duration-300',
        finished
          ? 'bg-white/60 shadow-[0_4px_12px_rgba(15,23,42,0.04)] saturate-[0.35]'
          : 'bg-white shadow-[0_8px_18px_rgba(15,23,42,0.08)]',
        style.shell,
        style.border,
        finished
          ? 'cursor-pointer hover:shadow-[0_6px_16px_rgba(15,23,42,0.06)]'
          : editMode && canDrag
            ? 'cursor-grab ring-1 ring-indigo-200'
            : editMode
              ? 'cursor-pointer ring-1 ring-slate-200'
              : 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(15,23,42,0.1)]',
        isDragging && 'cursor-grabbing opacity-70 ring-2 ring-indigo-400 shadow-xl',
      )}
      style={{
        top,
        height,
        transform: transformStyle,
        touchAction: editMode ? 'none' : 'auto',
      }}
    >
      {editMode && canDrag ? (
        <div className="pointer-events-none absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-indigo-500 shadow-sm">
          <GripVertical className="h-3 w-3" />
        </div>
      ) : null}
      {children}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedShopId, setSelectedShopId } = useSelectedShop();
  const [selectedDate, setSelectedDate] = useState<string>(todayInputValue());
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [liveNow, setLiveNow] = useState(() => new Date());
  const [topClientSearch, setTopClientSearch] = useState('');
  const [eodOpen, setEodOpen] = useState(false);
  const [walkInDrawer, setWalkInDrawer] = useState<WalkInDrawerState>({
    open: false,
    staffId: '',
    startMinutes: DEFAULT_START_MINUTES,
  });
  const [appointmentDetail, setAppointmentDetail] = useState<AppointmentDetailState>({
    open: false,
    booking: null,
  });
  const [appointmentSaving, setAppointmentSaving] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutState>({
    open: false,
    booking: null,
  });
  const [gridMessage, setGridMessage] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [clientDrawer, setClientDrawer] = useState<{
    open: boolean;
    clientId: string | null;
    bookingId: string | null;
  }>({ open: false, clientId: null, bookingId: null });
  const [slotHover, setSlotHover] = useState<{
    staffId: string;
    startMinutes: number;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    bookingId: string;
    staffId: string;
    startMinutes: number;
    durationMinutes: number;
  } | null>(null);

  const businessQuery = useQuery({
    queryKey: ['business', selectedShopId],
    queryFn: () => businessService.getBusiness(selectedShopId),
    enabled: !!selectedShopId,
  });

  const staffQuery = useQuery({
    queryKey: ['business-staff', selectedShopId],
    queryFn: () => businessService.getBusinessStaff(selectedShopId),
    enabled: !!selectedShopId,
  });

  const staffStatsQuery = useQuery({
    queryKey: ['staff-stats', selectedShopId],
    queryFn: () => dashboardService.getStaffStats(selectedShopId),
    enabled: !!selectedShopId,
    refetchInterval: 60_000,
  });

  const servicesQuery = useQuery({
    queryKey: ['business-services', selectedShopId],
    queryFn: () => businessService.getBusinessServices(selectedShopId),
    enabled: !!selectedShopId,
  });

  const bookingsQuery = useQuery({
    queryKey: ['dashboard-bookings', selectedShopId, selectedDate],
    queryFn: () => dashboardService.getBookings(selectedShopId, { date: selectedDate }),
    enabled: !!selectedShopId,
  });

  const productsQuery = useQuery({
    queryKey: ['dashboard-products', selectedShopId],
    queryFn: () => dashboardService.getProducts(selectedShopId),
    enabled: !!selectedShopId,
  });

  useEffect(() => {
    let mounted = true;
    const failSafe = window.setTimeout(() => {
      if (!mounted) return;
      setIsAuthChecking(false);
      router.replace('/auth/signin');
    }, 12000);

    const run = async () => {
      try {
        // Prefer direct fetch when localStorage has a dev user — avoids NextAuth hang
        const { getDevUserId } = await import('@/lib/devAuth');
        const { DEV_AUTH_TOKEN } = await import('@/lib/devAuth');
        const devId = getDevUserId();
        if (devId) {
          const apiBase =
            process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api/v1';
          const res = await fetch(`${apiBase}/auth/me`, {
            headers: {
              'x-dev-user-id': devId,
              Authorization: `Bearer ${DEV_AUTH_TOKEN}`,
            },
          });
          if (!mounted) return;
          window.clearTimeout(failSafe);
          if (!res.ok) throw new Error('auth failed');
          const body = await res.json();
          const user = (body?.data ?? body) as CurrentUser;
          setCurrentUser(user);
          setIsAuthChecking(false);
          if (user?.needsPasswordReset) {
            router.replace('/reset-password');
          }
          return;
        }

        const user = await authService.getCurrentUser();
        if (!mounted) return;
        window.clearTimeout(failSafe);
        setCurrentUser(user);
        setIsAuthChecking(false);
        if (user?.needsPasswordReset) {
          router.replace('/reset-password');
        }
      } catch {
        if (!mounted) return;
        window.clearTimeout(failSafe);
        setIsAuthChecking(false);
        router.replace('/auth/signin');
      }
    };

    void run();

    return () => {
      mounted = false;
      window.clearTimeout(failSafe);
    };
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => setLiveNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedShopId) return;

    // Pass the selected business into the socket handshake so the server
    // can authorize and join the matching workspace room.
    const businessId = selectedShopId;
    const socket = getDashboardSocket(businessId);
    const refreshDashboard = (payload?: BookingRealtimePayload) => {
      if (payload?.businessId && payload.businessId !== businessId) return;

      void queryClient.invalidateQueries({
        queryKey: ['dashboard-bookings', businessId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['staff-stats', businessId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['dashboard-products', businessId],
      });
    };

    socket.on('booking:new', refreshDashboard);
    socket.on('booking:updated', refreshDashboard);
    socket.connect();

    return () => {
      socket.off('booking:new', refreshDashboard);
      socket.off('booking:updated', refreshDashboard);
      socket.disconnect();
    };
  }, [queryClient, selectedShopId]);

  const business = businessQuery.data as
    | {
        type?: string;
        ownerId?: string;
        name?: string;
        openingTime?: string;
        closingTime?: string;
        slotInterval?: number;
      }
    | undefined;

  const isOwner = Boolean(currentUser?.roles?.includes('owner'));
  const isStaff = Boolean(currentUser?.roles?.includes('staff') && !isOwner);
  const isIndependent = business?.type === 'independent';

  const gridStartMinutes = timeStringToMinutes(business?.openingTime) ?? DEFAULT_START_MINUTES;
  const gridEndMinutes = timeStringToMinutes(business?.closingTime) ?? DEFAULT_END_MINUTES;
  const totalGridMinutes = Math.max(gridEndMinutes - gridStartMinutes, GRID_INTERVAL_MINUTES);
  const gridHeight = totalGridMinutes * PX_PER_MINUTE;
  const slots = buildSlots(gridStartMinutes, gridEndMinutes, GRID_INTERVAL_MINUTES);

  const visibleStaff = useMemo<VisibleStaff[]>(() => {
    const statsByStaffId = new Map(
      (staffStatsQuery.data || []).map((row) => [row.staffId, row]),
    );

    const resolvePresence = (staffId: string): VisibleStaff['presenceStatus'] =>
      statsByStaffId.get(staffId)?.presenceStatus || 'online';

    if (isIndependent && business?.ownerId) {
      const ownerId = String(business.ownerId);
      return [
        {
          id: ownerId,
          name: business.name || currentUser?.fullName || 'Independent Barber',
          presenceStatus: resolvePresence(ownerId),
        },
      ];
    }

    const mapped = ((staffQuery.data || []) as StaffMember[])
      .map((staff) => {
        const columnId = resolveStaffColumnId(staff);
        return {
          id: columnId,
          name: staff.userId?.fullName || 'Staff Member',
          avatarUrl: staff.userId?.profilePicture,
          presenceStatus: resolvePresence(columnId),
          userId: { firebaseUid: staff.userId?.firebaseUid },
        };
      })
      .filter((staff) => Boolean(staff.id));

    if (isStaff && currentUser?.firebaseUid) {
      const mine = mapped.filter((staff) => staff.userId?.firebaseUid === currentUser.firebaseUid);
      if (mine.length > 0) return mine;
      if (mapped.length > 0) return mapped.slice(0, 1);
    }

    return mapped;
  }, [
    business?.name,
    business?.ownerId,
    currentUser?.firebaseUid,
    currentUser?.fullName,
    isIndependent,
    isStaff,
    staffQuery.data,
    staffStatsQuery.data,
  ]);

  const bookings = Array.isArray(bookingsQuery.data)
    ? (bookingsQuery.data as unknown as BookingItem[])
    : [];
  const services = ((servicesQuery.data || []) as unknown as Array<Record<string, unknown>>).map((service) => ({
    _id: String(service._id || service.id),
    name: String(service.name || 'Service'),
    duration: Number(service.duration || service.durationMinutes || 0),
    basePrice: Number(service.basePrice || service.price || 0),
    category: typeof service.category === 'string' ? service.category : undefined,
    categoryName: typeof service.categoryName === 'string' ? service.categoryName : undefined,
  })) as ServiceItem[];

  const walkInAssignableServices = useMemo(() => {
    if (!walkInDrawer.staffId) return services;
    const member = ((staffQuery.data || []) as StaffMember[]).find(
      (row) => resolveStaffColumnId(row) === walkInDrawer.staffId,
    );
    if (!member) return services;
    const allowed = (member.services || [])
      .map((s) => {
        if (typeof s === 'string') return s;
        return String(s._id || '');
      })
      .filter(Boolean);
    if (allowed.length === 0) return services;
    return services.filter((service) => allowed.includes(service._id));
  }, [services, staffQuery.data, walkInDrawer.staffId]);

  const products = (productsQuery.data || []) as ProductItem[];

  const visibleStaffIds = useMemo(() => new Set(visibleStaff.map((staff) => staff.id)), [visibleStaff]);

  const currentBookings = useMemo(
    () =>
      bookings
        .filter((booking) => {
          if (booking.status === 'cancelled' || booking.computedStatus === 'cancelled') {
            return false;
          }
          const key = resolveBookingStaffKey(booking.staffId);
          return key && visibleStaffIds.has(key);
        })
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [bookings, visibleStaffIds],
  );

  const bookingsByStaff = useMemo(() => {
    const map = new Map<string, BookingItem[]>();
    for (const booking of currentBookings) {
      const staffId = resolveBookingStaffKey(booking.staffId);
      const list = map.get(staffId) || [];
      list.push(booking);
      map.set(staffId, list);
    }
    return map;
  }, [currentBookings]);

  const schedulerLoadError = useMemo(() => {
    if (!selectedShopId) return null;

    const queryError = bookingsQuery.error ?? staffQuery.error;
    if (axios.isAxiosError(queryError) && !queryError.response) {
      return 'Cannot reach the API at localhost:5000. Start MongoDB (docker compose up -d), run npm run seed:mustdash, then npm run dev in the project root.';
    }

    if (bookingsQuery.isError) {
      return 'Could not load bookings. Use Login as Test Owner, select Must Dash, and ensure the API is running.';
    }

    if (staffQuery.isError) {
      return 'Could not load staff for this shop. Re-run npm run seed:mustdash, then sign in again with Login as Test Owner.';
    }

    if (!staffQuery.isLoading && !staffQuery.isError && visibleStaff.length === 0) {
      return 'No staff columns available for the selected shop.';
    }

    return null;
  }, [
    bookingsQuery.error,
    bookingsQuery.isError,
    selectedShopId,
    staffQuery.error,
    staffQuery.isError,
    staffQuery.isLoading,
    visibleStaff.length,
  ]);

  const liveLineTop = useMemo(() => {
    if (selectedDate !== todayInputValue()) return null;
    const minutes = liveNow.getHours() * 60 + liveNow.getMinutes();
    if (minutes < gridStartMinutes || minutes > gridEndMinutes) return null;
    return minuteToTop(minutes, gridStartMinutes);
  }, [gridEndMinutes, gridStartMinutes, liveNow, selectedDate]);

  const shiftDate = (days: number) => {
    const next = new Date(`${selectedDate}T00:00:00`);
    next.setDate(next.getDate() + days);
    const month = String(next.getMonth() + 1).padStart(2, '0');
    const day = String(next.getDate()).padStart(2, '0');
    setSelectedDate(`${next.getFullYear()}-${month}-${day}`);
  };

  const openWalkInDrawer = (staffId: string, startMinutes: number) => {
    setWalkInDrawer({ open: true, staffId, startMinutes });
  };

  const handleAddWalkIn = () => {
    if (!selectedShopId) {
      setGridMessage('Select a shop first (use the dropdown or Login as Test Owner).');
      return;
    }
    if (visibleStaff.length === 0) {
      setGridMessage('No staff loaded for this shop. Run the seed script and refresh.');
      return;
    }
    if (services.length === 0) {
      setGridMessage('No services found. Add services before creating walk-ins.');
      return;
    }
    setGridMessage('');
    openWalkInDrawer(visibleStaff[0].id, gridStartMinutes);
  };

  const snapMinutesFromOffset = (offsetY: number) => {
    const rawMinutes = gridStartMinutes + offsetY / PX_PER_MINUTE;
    return Math.max(
      gridStartMinutes,
      Math.min(
        gridEndMinutes - GRID_INTERVAL_MINUTES,
        Math.floor(rawMinutes / GRID_INTERVAL_MINUTES) * GRID_INTERVAL_MINUTES,
      ),
    );
  };

  const handleColumnClick = (
    event: MouseEvent<HTMLButtonElement>,
    staffId: string,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const snappedMinutes = snapMinutesFromOffset(event.clientY - rect.top);
    openWalkInDrawer(staffId, snappedMinutes);
  };

  const handleColumnHover = (
    event: MouseEvent<HTMLButtonElement>,
    staffId: string,
  ) => {
    if (editMode) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const startMinutes = snapMinutesFromOffset(event.clientY - rect.top);
    setSlotHover((prev) =>
      prev?.staffId === staffId && prev.startMinutes === startMinutes
        ? prev
        : { staffId, startMinutes },
    );
  };

  const choosingSlot =
    walkInDrawer.open && walkInDrawer.staffId
      ? {
          staffId: walkInDrawer.staffId,
          startMinutes: walkInDrawer.startMinutes,
        }
      : slotHover;
  const choosingTop = choosingSlot
    ? minuteToTop(choosingSlot.startMinutes, gridStartMinutes)
    : null;

  const openCheckoutSidebar = (booking: BookingItem) => {
    setCheckout({ open: true, booking });
  };

  const openAppointmentDetail = (booking: BookingItem) => {
    setAppointmentDetail({ open: true, booking });
  };

  const closeAppointmentDetail = () => {
    setAppointmentDetail({ open: false, booking: null });
  };

  const openClientDrawer = (booking: BookingItem) => {
    if (!booking.clientId?._id) {
      setGridMessage('No client linked to this booking.');
      return;
    }
    setGridMessage('');
    setClientDrawer({
      open: true,
      clientId: booking.clientId._id,
      bookingId: booking._id,
    });
  };

  const closeClientDrawer = () =>
    setClientDrawer({ open: false, clientId: null, bookingId: null });

  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const rescheduleMutation = useMutation({
    mutationFn: ({
      bookingId,
      startTime,
      endTime,
      staffId,
    }: {
      bookingId: string;
      startTime: string;
      endTime: string;
      staffId?: string;
    }) =>
      dashboardService.rescheduleBooking(bookingId, {
        startTime,
        endTime,
        staffId,
      }),
    onMutate: async ({ bookingId, startTime, endTime, staffId }) => {
      await queryClient.cancelQueries({
        queryKey: ['dashboard-bookings', selectedShopId, selectedDate],
      });
      const previous = queryClient.getQueryData<BookingItem[] | unknown>([
        'dashboard-bookings',
        selectedShopId,
        selectedDate,
      ]);
      queryClient.setQueryData(
        ['dashboard-bookings', selectedShopId, selectedDate],
        (old: unknown) => {
          const list = Array.isArray(old) ? (old as BookingItem[]) : [];
          return list.map((b) =>
            b._id === bookingId
              ? {
                  ...b,
                  startTime,
                  endTime,
                  staffId: staffId
                    ? typeof b.staffId === 'object' && b.staffId
                      ? { ...b.staffId, _id: staffId }
                      : staffId
                    : b.staffId,
                }
              : b,
          );
        },
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(
          ['dashboard-bookings', selectedShopId, selectedDate],
          context.previous,
        );
      }
      setGridMessage('Could not reschedule booking — slot conflict or invalid time.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['dashboard-bookings', selectedShopId, selectedDate],
      });
    },
  });

  const dragOriginRef = useRef<{ booking: BookingItem | null }>({ booking: null });

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    const booking = currentBookings.find((b) => b._id === id) || null;
    dragOriginRef.current.booking = booking;
    if (booking) {
      setDragPreview({
        bookingId: booking._id,
        staffId: resolveBookingStaffKey(booking.staffId),
        startMinutes: toMinutes(booking.startTime),
        durationMinutes:
          toMinutes(booking.endTime) - toMinutes(booking.startTime),
      });
    }
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const booking = dragOriginRef.current.booking;
    if (!booking) return;
    const deltaY = event.delta.y;
    const deltaX = event.delta.x;

    const startMinutes = toMinutes(booking.startTime);
    const endMinutes = toMinutes(booking.endTime);
    const duration = endMinutes - startMinutes;
    const rawNewStart = startMinutes + deltaY / PX_PER_MINUTE;
    const snappedStart = Math.round(rawNewStart / GRID_INTERVAL_MINUTES) * GRID_INTERVAL_MINUTES;
    const clampedStart = Math.max(
      gridStartMinutes,
      Math.min(gridEndMinutes - duration, snappedStart),
    );

    const originalStaffKey = resolveBookingStaffKey(booking.staffId);
    const originalColumnIndex = visibleStaff.findIndex(
      (staff) => staff.id === originalStaffKey,
    );
    const columnDelta = Math.round(deltaX / STAFF_COLUMN_WIDTH);
    const targetColumnIndex = Math.max(
      0,
      Math.min(
        visibleStaff.length - 1,
        (originalColumnIndex === -1 ? 0 : originalColumnIndex) + columnDelta,
      ),
    );
    const targetStaffId = visibleStaff[targetColumnIndex]?.id || originalStaffKey;

    setDragPreview({
      bookingId: booking._id,
      staffId: targetStaffId,
      startMinutes: clampedStart,
      durationMinutes: duration,
    });
  };

  const handleDragEnd = (_event: DragEndEvent) => {
    const booking = dragOriginRef.current.booking;
    const preview = dragPreview;
    dragOriginRef.current.booking = null;
    setDragPreview(null);

    if (!booking || !preview) return;
    const originalStart = toMinutes(booking.startTime);
    const originalStaff = resolveBookingStaffKey(booking.staffId);

    const unchanged =
      preview.startMinutes === originalStart &&
      preview.staffId === originalStaff;
    if (unchanged) return;

    const newStartDate = parseDateAndMinutes(selectedDate, preview.startMinutes);
    const newEndDate = parseDateAndMinutes(
      selectedDate,
      preview.startMinutes + preview.durationMinutes,
    );

    rescheduleMutation.mutate({
      bookingId: booking._id,
      startTime: newStartDate.toISOString(),
      endTime: newEndDate.toISOString(),
      staffId: preview.staffId !== originalStaff ? preview.staffId : undefined,
    });
  };

  const closeCheckout = () => {
    setCheckout({ open: false, booking: null });
  };

  const resolveWalkInStartMinutes = (startMinutes: number): number => {
    if (selectedDate !== todayInputValue()) return startMinutes;
    const nowMinutes = liveNow.getHours() * 60 + liveNow.getMinutes();
    const snapped = Math.ceil(nowMinutes / GRID_INTERVAL_MINUTES) * GRID_INTERVAL_MINUTES;
    return Math.max(startMinutes, Math.min(gridEndMinutes - GRID_INTERVAL_MINUTES, snapped));
  };

  const normalizeBookingFromApi = (raw: Record<string, unknown>): BookingItem => {
    const serviceIds = normalizeServiceIdsField(raw.serviceIds);
    const normalized =
      serviceIds.length > 0
        ? serviceIds
        : normalizeServiceIdsField(
            raw.serviceId ? [raw.serviceId] : [],
          );

    return {
      ...(raw as unknown as BookingItem),
      _id: String(raw._id || raw.id),
      serviceIds: normalized as BookingItem['serviceIds'],
    };
  };

  const removeBookingFromGridCache = (bookingId: string) => {
    queryClient.setQueryData(
      ['dashboard-bookings', selectedShopId, selectedDate],
      (old: unknown) => {
        const list = Array.isArray(old) ? (old as BookingItem[]) : [];
        return list.filter((b) => b._id !== bookingId);
      },
    );
  };

  const handleWalkInFromDrawer = async (data: WalkInSubmitData) => {
    if (!selectedShopId || !walkInDrawer.staffId) {
      throw new Error('Select a staff member and shop first.');
    }

    let phoneNumber: string;
    let fullName: string;
    let email: string | undefined;

    if (data.selectedClient) {
      phoneNumber = data.selectedClient.phoneNumber;
      fullName = data.selectedClient.fullName;
      email = data.selectedClient.email?.trim() || undefined;
    } else if (data.isAnonymous) {
      phoneNumber = `+2519${String(Date.now()).slice(-8)}`;
      fullName = 'Walk-in';
    } else {
      phoneNumber = data.newClientPhone.trim();
      fullName = data.newClientName.trim();
      email = data.newClientEmail.trim() || undefined;
    }

    if (!phoneNumber || phoneNumber.trim().length < 7) {
      phoneNumber = `+2519${String(Date.now()).slice(-8)}`;
    }

    const selectedServices = services.filter((s) => data.selectedServiceIds.includes(s._id));
    if (!selectedServices.length) {
      throw new Error('Select at least one service.');
    }

    const startMinutes = resolveWalkInStartMinutes(walkInDrawer.startMinutes);
    let cursor = parseDateAndMinutes(selectedDate, startMinutes);
    const staffPlan = selectedServices.map((service) => {
      const startTime = new Date(cursor);
      const duration = Math.max(service.duration || 30, 5);
      const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
      cursor = endTime;
      return {
        staffId: walkInDrawer.staffId,
        serviceId: service._id,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      };
    });

    try {
      const created = await dashboardService.createWalkIn(selectedShopId, {
        serviceIds: data.selectedServiceIds,
        staffPlan,
        startTime: staffPlan[0].startTime,
        endTime: staffPlan[staffPlan.length - 1].endTime,
        phoneNumber,
        fullName,
        email,
        paymentMethod: 'cash',
      });

      const booking = normalizeBookingFromApi(created as Record<string, unknown>);
      setWalkInDrawer({ open: false, staffId: '', startMinutes: gridStartMinutes });
      await queryClient.invalidateQueries({
        queryKey: ['dashboard-bookings', selectedShopId, selectedDate],
      });
      await queryClient.invalidateQueries({
        queryKey: ['client-search-drawer', selectedShopId],
      });
      setAppointmentDetail({ open: true, booking });
      setGridMessage('');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const apiMessage =
          (err.response?.data as { message?: string })?.message ||
          (err.response?.data as { error?: string })?.error;
        throw new Error(apiMessage || 'Could not create walk-in booking.');
      }
      throw err;
    }
  };

  const handleAppointmentSave = async (
    payload: AppointmentSavePayload,
    options?: { openCheckout?: boolean },
  ) => {
    if (!selectedShopId || !appointmentDetail.booking) return;
    setAppointmentSaving(true);
    try {
      const updated = await dashboardService.updateBookingAppointment(
        selectedShopId,
        appointmentDetail.booking._id,
        {
          appointmentNotes: payload.appointmentNotes,
          serviceIds: payload.serviceIds,
          tipAmount: payload.tipAmount,
        },
      );
      const booking = normalizeBookingFromApi(updated as Record<string, unknown>);
      await queryClient.invalidateQueries({ queryKey: ['dashboard-bookings', selectedShopId, selectedDate] });
      if (options?.openCheckout) {
        setAppointmentDetail({ open: false, booking: null });
        setCheckout({ open: true, booking });
      } else {
        setAppointmentDetail({ open: true, booking });
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setGridMessage(
          (err.response?.data as { message?: string })?.message || 'Could not save appointment.',
        );
      } else {
        setGridMessage('Could not save appointment.');
      }
      throw err;
    } finally {
      setAppointmentSaving(false);
    }
  };

  // Kept for legacy quick-walk-in path (column click now uses drawer)
  const handleCheckoutPay = async (data: {
    products: Array<{ productId: string; quantity: number }>;
    paymentMethod: PaymentMethodId;
    tip?: number;
  }) => {
    if (!checkout.booking) return;
    const bookingId = checkout.booking._id;

    const result = await dashboardService.checkoutBooking(bookingId, {
      products: data.products,
      paymentMethod: data.paymentMethod,
    });

    // A locally recorded cash payment is not yet a server-confirmed payment.
    if (result?.__offline) {
      closeCheckout();
      await queryClient.invalidateQueries({ queryKey: ['dashboard-bookings', selectedShopId, selectedDate] });
      return;
    }

    queryClient.setQueryData(
      ['dashboard-bookings', selectedShopId, selectedDate],
      (old: unknown) => {
        const list = Array.isArray(old) ? (old as BookingItem[]) : [];
        return list.map((b) =>
          b._id === bookingId
            ? { ...b, paymentStatus: 'paid', paymentMethod: data.paymentMethod }
            : b,
        );
      },
    );

    closeCheckout();
    await queryClient.invalidateQueries({ queryKey: ['dashboard-bookings', selectedShopId, selectedDate] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-products', selectedShopId] });
  };

  if (isAuthChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#eef3fb]">
        <div className="rounded-full border border-slate-200 bg-white px-6 py-3 text-sm text-slate-600 shadow-sm">
          Checking account security...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f4f6fb] text-slate-900">
      <Sidebar />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-[#eceff3] bg-white px-4 py-3 shadow-sm lg:px-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1 max-w-[320px]">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={topClientSearch}
                onChange={(event) => setTopClientSearch(event.target.value)}
                placeholder="Client search"
                className="h-11 w-full rounded-full border border-[#e5e7eb] bg-[#f8f9fa] pl-11 pr-4 text-sm text-slate-700 outline-none transition focus:border-slate-400"
              />
            </div>

            <ShopSelector selectedShopId={selectedShopId} onSelect={setSelectedShopId} />

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => shiftDate(-1)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-slate-500 transition hover:bg-[#f8f9fa]"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <span>{formatDisplayDate(selectedDate)}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDate(todayInputValue())}
                className="rounded-full bg-[#111b65] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1a2578]"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => shiftDate(1)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-slate-500 transition hover:bg-[#f8f9fa]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {gridMessage ? (
                <p className="max-w-[200px] truncate text-xs text-amber-600">{gridMessage}</p>
              ) : null}
              {isOwner ? (
                <button
                  type="button"
                  onClick={() => setEodOpen(true)}
                  disabled={!selectedShopId}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <Moon className="h-4 w-4 text-[#111b65]" />
                  End of Day
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition',
                  editMode
                    ? 'border-amber-300 bg-amber-50 text-amber-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {editMode ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {editMode ? 'Edit' : 'Locked'}
              </button>
              <button
                type="button"
                onClick={handleAddWalkIn}
                className="inline-flex items-center gap-2 rounded-full bg-[#111b65] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1a2578]"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
          </div>
        </header>

        {!selectedShopId ? (
          <div className="flex flex-1 items-center justify-center p-12 text-slate-500">
            Please select a shop to load the workstation grid.
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
            {schedulerLoadError ? (
              <p className="shrink-0 border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-600">
                {schedulerLoadError}
              </p>
            ) : null}

            {visibleStaff.length > 0 ? (
              <DndContext
                sensors={dndSensors}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onDragCancel={() => {
                  dragOriginRef.current.booking = null;
                  setDragPreview(null);
                }}
              >
                <div className="min-h-0 flex-1 overflow-auto">
                      <div
                        className="min-w-max"
                        style={{
                          width: GUTTER_WIDTH + visibleStaff.length * STAFF_COLUMN_WIDTH,
                        }}
                      >
                        <div className="sticky top-0 z-30 flex border-b border-slate-100 bg-white/95 backdrop-blur">
                          <div
                            className="shrink-0 border-r border-[#eceff3] bg-white"
                            style={{ width: GUTTER_WIDTH }}
                          />

                          {visibleStaff.map((staff) => (
                            <div
                              key={staff.id}
                              className="flex shrink-0 items-center justify-center gap-3 border-r border-[#eceff3] px-4 py-5"
                              style={{ width: STAFF_COLUMN_WIDTH }}
                            >
                              <div className="relative">
                                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-slate-200 bg-white text-base font-semibold text-slate-700 shadow-sm">
                                  {staff.avatarUrl ? (
                                    <img
                                      src={staff.avatarUrl}
                                      alt={staff.name}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    avatarFallback(staff.name)
                                  )}
                                </div>
                                <span
                                  className={cn(
                                    'absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full ring-2',
                                    presenceDotClass(staff.presenceStatus),
                                  )}
                                  title={presenceLabel(staff.presenceStatus)}
                                />
                              </div>
                              <div className="min-w-0 text-center">
                                <div className="truncate text-base font-semibold text-slate-900">{staff.name}</div>
                                <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                                  {isIndependent ? 'Independent' : presenceLabel(staff.presenceStatus)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex">
                          <div
                            className="relative shrink-0 border-r border-[#eceff3] bg-white"
                            style={{ width: GUTTER_WIDTH, height: gridHeight }}
                          >
                            {slots.map((slot) => {
                              const top = minuteToTop(slot, gridStartMinutes);
                              const isHour = slot % 60 === 0;
                              return (
                                <div
                                  key={slot}
                                  className="absolute inset-x-0"
                                  style={{ top }}
                                >
                                  <div className="relative -translate-y-1/2 px-3">
                                    <span
                                      className={cn(
                                        'block text-right text-[11px] font-medium',
                                        isHour ? 'text-slate-700' : 'text-slate-400',
                                      )}
                                    >
                                      {minutesToLabel(slot)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}

                            {liveLineTop !== null ? (
                              <div className="absolute inset-x-0 z-20" style={{ top: liveLineTop }}>
                                <div className="relative -translate-y-1/2 px-2">
                                  <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-500 shadow-sm">
                                    <span className="h-2 w-2 rounded-full bg-rose-500 ring-2 ring-rose-200 animate-pulse" />
                                    {minutesToLabel(liveNow.getHours() * 60 + liveNow.getMinutes())}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>

                          <div
                            className="relative"
                            style={{
                              width: visibleStaff.length * STAFF_COLUMN_WIDTH,
                              height: gridHeight,
                            }}
                          >
                            {slots.map((slot) => {
                              const top = minuteToTop(slot, gridStartMinutes);
                              const isHour = slot % 60 === 0;
                              return (
                                <div
                                  key={slot}
                                  className={cn(
                                    'pointer-events-none absolute inset-x-0 border-t',
                                    isHour ? 'border-slate-300' : 'border-slate-100',
                                  )}
                                  style={{ top }}
                                />
                              );
                            })}

                            {visibleStaff.map((staff, columnIndex) => {
                              const columnBookings = bookingsByStaff.get(staff.id) || [];
                              const isChoosingColumn =
                                choosingSlot?.staffId === staff.id;
                              return (
                                <div
                                  key={staff.id}
                                  className="absolute top-0 border-r border-[#eceff3]"
                                  style={{
                                    left: columnIndex * STAFF_COLUMN_WIDTH,
                                    width: STAFF_COLUMN_WIDTH,
                                    height: gridHeight,
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={(event) => handleColumnClick(event, staff.id)}
                                    onMouseMove={(event) =>
                                      handleColumnHover(event, staff.id)
                                    }
                                    onMouseLeave={() => {
                                      if (!walkInDrawer.open) setSlotHover(null);
                                    }}
                                    disabled={editMode}
                                    className={cn(
                                      'absolute inset-0 z-0 bg-transparent',
                                      editMode
                                        ? 'cursor-default bg-amber-50/30'
                                        : 'cursor-copy',
                                    )}
                                    aria-label={`Add walk-in for ${staff.name}`}
                                  />

                                  {isChoosingColumn && choosingTop !== null && !editMode ? (
                                    <>
                                      <div
                                        className={cn(
                                          'pointer-events-none absolute left-1.5 right-1.5 z-20 rounded-[12px] border transition',
                                          walkInDrawer.open
                                            ? 'border-[#111b65]/50 bg-[#111b65]/10 shadow-[0_0_0_1px_rgba(17,27,101,0.08)]'
                                            : 'border-[#111b65]/35 bg-[rgba(17,27,101,0.07)]',
                                        )}
                                        style={{
                                          top: choosingTop,
                                          height: GRID_INTERVAL_MINUTES * PX_PER_MINUTE,
                                        }}
                                      />
                                      <div
                                        className="pointer-events-none absolute left-1.5 right-1.5 z-30 flex items-center"
                                        style={{ top: choosingTop - 10 }}
                                      >
                                        <span
                                          className={cn(
                                            'ml-auto mr-1 flex h-7 w-7 items-center justify-center rounded-full border shadow-sm',
                                            walkInDrawer.open
                                              ? 'border-[#111b65] bg-[#111b65] text-white'
                                              : 'border-[#111b65]/40 bg-white text-[#111b65]',
                                          )}
                                        >
                                          <Plus className="h-3.5 w-3.5" />
                                        </span>
                                      </div>
                                    </>
                                  ) : null}

                                  {dragPreview && dragPreview.staffId === staff.id ? (
                                    <div
                                      className="pointer-events-none absolute left-1.5 right-1.5 z-20 rounded-[14px] border-2 border-dashed border-indigo-400 bg-indigo-50/70"
                                      style={{
                                        top: minuteToTop(dragPreview.startMinutes, gridStartMinutes),
                                        height: Math.max(
                                          GRID_INTERVAL_MINUTES * PX_PER_MINUTE,
                                          dragPreview.durationMinutes * PX_PER_MINUTE,
                                        ),
                                      }}
                                    >
                                      <div className="px-3 pt-1.5 text-[11px] font-semibold text-indigo-700">
                                        {minutesToLabel(dragPreview.startMinutes)} -{' '}
                                        {minutesToLabel(
                                          dragPreview.startMinutes + dragPreview.durationMinutes,
                                        )}
                                      </div>
                                    </div>
                                  ) : null}

                                  {columnBookings.map((booking) => {
                                    const startMinutes = toMinutes(booking.startTime);
                                    const endMinutes = toMinutes(booking.endTime);
                                    const top = minuteToTop(startMinutes, gridStartMinutes);
                                    const height = Math.max(
                                      GRID_INTERVAL_MINUTES * PX_PER_MINUTE,
                                      (endMinutes - startMinutes) * PX_PER_MINUTE,
                                    );
                                    const finished = isBookingFinished(booking);
                                    const style = resolveBookingCardStyle(booking);
                                    const canDrag = isBookingReschedulable(booking);

                                    return (
                                      <DraggableBookingCard
                                        key={booking._id}
                                        booking={booking}
                                        editMode={editMode}
                                        canDrag={canDrag}
                                        finished={finished}
                                        style={style}
                                        top={top}
                                        height={height}
                                        startMinutes={startMinutes}
                                        endMinutes={endMinutes}
                                        onCardClick={(b) => openAppointmentDetail(b)}
                                      >
                                        <div className={cn('absolute inset-y-0 left-0 w-1', style.accent)} />
                                        {finished ? (
                                          <div
                                            className="pointer-events-none absolute inset-0 opacity-[0.45]"
                                            style={{
                                              backgroundImage:
                                                'repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(148,163,184,0.12) 6px, rgba(148,163,184,0.12) 7px)',
                                            }}
                                          />
                                        ) : null}
                                        <div className="relative pl-3">
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                              <div
                                                className={cn(
                                                  'text-[11px] font-semibold',
                                                  finished ? 'text-slate-400' : 'text-slate-600',
                                                )}
                                              >
                                                {minutesToLabel(startMinutes)} - {minutesToLabel(endMinutes)}
                                              </div>
                                              <div
                                                className={cn(
                                                  'mt-1 truncate text-[13px] font-bold',
                                                  finished ? 'text-slate-500' : 'text-slate-900',
                                                )}
                                              >
                                                {bookingCustomer(booking)}
                                              </div>
                                            </div>
                                            <div
                                              className={cn(
                                                'flex shrink-0 items-center gap-1',
                                                finished ? 'text-emerald-500/80' : 'text-slate-400',
                                              )}
                                            >
                                              <CheckCircle2
                                                className={cn(
                                                  'h-3.5 w-3.5',
                                                  finished && 'fill-emerald-500/15',
                                                )}
                                              />
                                              {!finished ? (
                                                <UserRound className="h-3.5 w-3.5" />
                                              ) : null}
                                            </div>
                                          </div>

                                          <div
                                            className={cn(
                                              'mt-1 line-clamp-2 text-[11px] font-medium',
                                              finished ? 'text-slate-400' : 'text-slate-700',
                                            )}
                                          >
                                            {bookingTitle(booking)}
                                          </div>
                                          <div className="mt-1">
                                            <span
                                              className={cn(
                                                'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
                                                style.badge,
                                              )}
                                            >
                                              {finished ? 'Completed' : bookingCategoryLabel(booking)}
                                            </span>
                                          </div>
                                          <div
                                            className={cn(
                                              'mt-2 flex items-center justify-between text-xs',
                                              finished ? 'text-slate-400' : 'text-slate-600',
                                            )}
                                          >
                                            <span>
                                              {finished
                                                ? booking.paymentMethod === 'cash'
                                                  ? 'Paid · Cash'
                                                  : 'Paid · Transfer'
                                                : booking.isWalkIn
                                                  ? 'Walk-in'
                                                  : 'Booked'}
                                            </span>
                                            <span
                                              className={cn(
                                                'font-semibold',
                                                finished ? 'text-slate-500' : 'text-slate-800',
                                              )}
                                            >
                                              ${Number(booking.totalAmount || 0).toFixed(2)}
                                            </span>
                                          </div>
                                        </div>
                                      </DraggableBookingCard>
                                    );
                                  })}
                                </div>
                              );
                            })}

                            {choosingTop !== null && !editMode ? (
                              <div
                                className="pointer-events-none absolute left-0 right-0 z-[25]"
                                style={{ top: choosingTop }}
                              >
                                <div
                                  className={cn(
                                    'absolute inset-x-0 border-t-2',
                                    walkInDrawer.open
                                      ? 'border-[#111b65]'
                                      : 'border-[#111b65]/70',
                                  )}
                                />
                                <div
                                  className={cn(
                                    'absolute -top-[8px] flex h-[16px] items-center rounded-full px-2 text-[10px] font-bold tracking-wide shadow-sm',
                                    walkInDrawer.open
                                      ? 'bg-[#111b65] text-white'
                                      : 'bg-white text-[#111b65] ring-1 ring-[#111b65]/30',
                                  )}
                                  style={{ left: 8 }}
                                >
                                  {minutesToLabel(choosingSlot!.startMinutes)}
                                </div>
                              </div>
                            ) : null}

                            {liveLineTop !== null ? (
                              <div
                                className="pointer-events-none absolute left-0 right-0 z-20 border-t-2 border-rose-500"
                                style={{ top: liveLineTop }}
                              >
                                <div className="absolute -top-[7px] -left-[7px] h-3 w-3 rounded-full bg-rose-500 ring-4 ring-rose-200/70 shadow-sm animate-pulse" />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
              </DndContext>
            ) : !schedulerLoadError ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
                Loading staff columns…
              </div>
            ) : null}
          </div>
        )}
      </main>

      {/* ─── Walk-in Drawer (multi-step: Choose Client → Choose Service) ─── */}
      <WalkInDrawer
        open={walkInDrawer.open}
        shopId={selectedShopId}
        startMinutes={walkInDrawer.startMinutes}
        services={walkInAssignableServices}
        onClose={() => {
          setSlotHover(null);
          setWalkInDrawer((s) => ({ ...s, open: false }));
        }}
        onSubmit={(data) => handleWalkInFromDrawer(data)}
      />

      {/* ─── Appointment Detail Drawer ─── */}
      <AppointmentDetailDrawer
        open={appointmentDetail.open}
        booking={appointmentDetail.booking as DetailBooking | null}
        services={services}
        saving={appointmentSaving}
        onClose={closeAppointmentDetail}
        onSave={async (payload) => {
          await handleAppointmentSave(payload);
        }}
        onCheckout={(payload) => handleAppointmentSave(payload, { openCheckout: true })}
        onCancel={async (bookingId) => {
          try {
            await dashboardService.cancelBooking(
              selectedShopId,
              bookingId,
              'Cancelled from appointment detail',
            );
            removeBookingFromGridCache(bookingId);
            closeAppointmentDetail();
            await queryClient.invalidateQueries({
              queryKey: ['dashboard-bookings', selectedShopId, selectedDate],
            });
            setGridMessage('');
          } catch {
            setGridMessage('Could not cancel booking.');
            throw new Error('Could not cancel booking.');
          }
        }}
      />

      {/* ─── Checkout Drawer (POS: items, tip, Save Unpaid / Pay) ─── */}
      <CheckoutDrawer
        open={checkout.open}
        booking={checkout.booking}
        products={products}
        onClose={closeCheckout}
        onPay={handleCheckoutPay}
        onSaveUnpaid={closeCheckout}
      />

      <EndOfDayModal
        open={eodOpen}
        shopId={selectedShopId}
        date={selectedDate}
        onClose={() => setEodOpen(false)}
      />

      <ClientDrawer
        open={clientDrawer.open}
        shopId={selectedShopId}
        clientId={clientDrawer.clientId}
        bookingId={clientDrawer.bookingId}
        onClose={closeClientDrawer}
        onCancelBooking={
          clientDrawer.bookingId
            ? async () => {
                if (!clientDrawer.bookingId) return;
                try {
                  await dashboardService.cancelBooking(
                    selectedShopId,
                    clientDrawer.bookingId,
                    'Cancelled from client drawer',
                  );
                  removeBookingFromGridCache(clientDrawer.bookingId);
                  closeClientDrawer();
                  await queryClient.invalidateQueries({
                    queryKey: ['dashboard-bookings', selectedShopId, selectedDate],
                  });
                } catch {
                  setGridMessage('Could not cancel booking.');
                }
              }
            : undefined
        }
        onCompleteBooking={
          clientDrawer.bookingId
            ? () => {
                const booking = currentBookings.find(
                  (b) => b._id === clientDrawer.bookingId,
                );
                closeClientDrawer();
                if (booking) openCheckoutSidebar(booking);
              }
            : undefined
        }
      />
    </div>
  );
}
