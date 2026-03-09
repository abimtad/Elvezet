import Availability from "../models/Availability";
import Absence from "../models/Absence";
import Booking from "../models/Booking";
import Business from "../models/Business";
import Service from "../models/Service";
import StaffProfile from "../models/StaffProfile";
import User from "../models/User";
import ApiError from "../utils/ApiError";
import { dayOfWeekFromDate, toMinutes } from "../utils/time";

const DEFAULT_SLOT_INTERVAL = 15;
const DEFAULT_OPENING_TIME = "09:00";
const DEFAULT_CLOSING_TIME = "18:00";
const DEFAULT_BOOKING_BUFFER_MINUTES = 10;
const SEARCH_WINDOW_DAYS = 30;

type AvailableSlotPlanItem = {
  professionalId: string;
  staffId: string;
  serviceId: string;
  startTime: string;
  endTime: string;
};

type AvailableSlot = {
  date: string;
  startTime: string;
  staffPlan: AvailableSlotPlanItem[];
};

export type AvailableSlotResponse = {
  availableSlots: AvailableSlot[];
  isFullyBooked: boolean;
  nextAvailableDate?: string;
};

type ServiceStep = {
  serviceId: string;
  duration: number;
  category: string;
};

type ReadWindow = {
  start: Date;
  end: Date;
  reads: Map<string, Promise<unknown>>;
};

const readOnce = <T>(window: ReadWindow | undefined, key: string, load: () => PromiseLike<T>): Promise<T> => {
  if (!window) return Promise.resolve(load());
  let pending = window.reads.get(key);
  if (!pending) {
    pending = Promise.resolve(load());
    window.reads.set(key, pending);
  }
  return pending as Promise<T>;
};

type DayContext = {
  dayStart: Date;
  slotInterval: number;
  openingMinutes: number;
  closingMinutes: number;
  totalDuration: number;
  orderedServices: ServiceStep[];
  staffIds: string[];
  staffServices: Map<string, Set<string>>;
  availabilityByStaff: Map<string, Array<{ start: number; end: number }>>;
  bookingConflictsByStaff: Map<string, Array<{ start: number; end: number }>>;
  absencesByStaff: Map<string, Array<{ start: number; end: number }>>;
  professionalId?: string;
  isClosedDay?: boolean;
  earliestBookingTime?: number;
};

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const parseDateInput = (value: string): Date => {
  if (DATE_ONLY_REGEX.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, "Invalid date. Use YYYY-MM-DD or ISO format.");
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const formatDateOnly = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const toDateAtMinutes = (dayStart: Date, minutesFromDayStart: number): Date => {
  const localMidnight = new Date(dayStart);
  return new Date(
    localMidnight.setHours(0, 0, 0, 0) + minutesFromDayStart * 60 * 1000,
  );
};

const diffMinutes = (date: Date, dayStart: Date): number => {
  return Math.floor((date.getTime() - dayStart.getTime()) / (60 * 1000));
};

const overlaps = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean => {
  return aStart < bEnd && aEnd > bStart;
};

const normalizeInterval = (
  start: number,
  end: number,
): { start: number; end: number } | null => {
  if (end <= 0) return null;
  if (start >= 24 * 60) return null;

  const normalizedStart = Math.max(0, start);
  const normalizedEnd = Math.min(24 * 60, end);
  if (normalizedEnd <= normalizedStart) return null;

  return { start: normalizedStart, end: normalizedEnd };
};

const getStaffServiceSet = (services: unknown[]): Set<string> => {
  return new Set(services.map((id) => String(id)));
};

const canHandleService = (
  staffServices: Map<string, Set<string>>,
  staffId: string,
  serviceId: string,
): boolean => {
  return Boolean(staffServices.get(staffId)?.has(serviceId));
};

const isStaffFreeForRange = (
  ctx: DayContext,
  staffId: string,
  start: number,
  end: number,
): boolean => {
  const windows = ctx.availabilityByStaff.get(staffId) || [];
  const withinWorkingWindow = windows.some(
    (window) => start >= window.start && end <= window.end,
  );

  if (!withinWorkingWindow) return false;

  const absences = ctx.absencesByStaff.get(staffId) || [];
  const hasAbsenceConflict = absences.some((absence) =>
    overlaps(start, end, absence.start, absence.end),
  );
  if (hasAbsenceConflict) return false;

  const bookings = ctx.bookingConflictsByStaff.get(staffId) || [];
  const hasBookingConflict = bookings.some((booking) =>
    overlaps(start, end, booking.start, booking.end),
  );

  return !hasBookingConflict;
};

const buildServiceSegments = (
  startMinutes: number,
  orderedServices: ServiceStep[],
): Array<{
  serviceId: string;
  category: string;
  start: number;
  end: number;
}> => {
  const segments: Array<{
    serviceId: string;
    category: string;
    start: number;
    end: number;
  }> = [];

  let cursor = startMinutes;
  for (const service of orderedServices) {
    const end = cursor + service.duration;
    segments.push({
      serviceId: service.serviceId,
      category: service.category,
      start: cursor,
      end,
    });
    cursor = end;
  }

  return segments;
};

const toPlanResponse = (
  dayStart: Date,
  plan: Array<{
    professionalId: string;
    serviceId: string;
    start: number;
    end: number;
  }>,
): AvailableSlotPlanItem[] => {
  return plan.map((item) => ({
    professionalId: item.professionalId,
    staffId: item.professionalId,
    serviceId: item.serviceId,
    startTime: toDateAtMinutes(dayStart, item.start).toISOString(),
    endTime: toDateAtMinutes(dayStart, item.end).toISOString(),
  }));
};

const findSingleStaffPlan = (
  ctx: DayContext,
  segments: Array<{
    serviceId: string;
    category: string;
    start: number;
    end: number;
  }>,
): Array<{
  professionalId: string;
  serviceId: string;
  start: number;
  end: number;
}> | null => {
  const neededServiceIds = new Set(
    segments.map((segment) => segment.serviceId),
  );

  for (const staffId of ctx.staffIds) {
    const services = ctx.staffServices.get(staffId);
    if (!services) continue;

    const coversAllServices = [...neededServiceIds].every((serviceId) =>
      services.has(serviceId),
    );
    if (!coversAllServices) continue;

    const start = segments[0].start;
    const end = segments[segments.length - 1].end;
    if (!isStaffFreeForRange(ctx, staffId, start, end)) continue;

    return segments.map((segment) => ({
      professionalId: staffId,
      serviceId: segment.serviceId,
      start: segment.start,
      end: segment.end,
    }));
  }

  return null;
};

const findBestChainPlan = (
  ctx: DayContext,
  segments: Array<{
    serviceId: string;
    category: string;
    start: number;
    end: number;
  }>,
): Array<{
  professionalId: string;
  serviceId: string;
  start: number;
  end: number;
}> | null => {
  type PlanRow = {
    professionalId: string;
    serviceId: string;
    category: string;
    start: number;
    end: number;
  };

  let bestPlan: PlanRow[] | null = null;
  let bestUniqueCount = Number.MAX_SAFE_INTEGER;

  const backtrack = (index: number, current: PlanRow[]): void => {
    if (index >= segments.length) {
      const uniqueCount = new Set(current.map((item) => item.professionalId))
        .size;
      if (uniqueCount < bestUniqueCount) {
        bestUniqueCount = uniqueCount;
        bestPlan = [...current];
      }
      return;
    }

    const segment = segments[index];
    const previousStaffId = current[current.length - 1]?.professionalId;
    const currentUniqueCount = new Set(
      current.map((item) => item.professionalId),
    ).size;
    if (currentUniqueCount > bestUniqueCount) return;

    const candidates = ctx.staffIds
      .filter((staffId) =>
        canHandleService(ctx.staffServices, staffId, segment.serviceId),
      )
      .sort((a, b) => {
        if (a === previousStaffId) return -1;
        if (b === previousStaffId) return 1;

        const aIsUsed = current.some((item) => item.professionalId === a);
        const bIsUsed = current.some((item) => item.professionalId === b);
        if (aIsUsed && !bIsUsed) return -1;
        if (!aIsUsed && bIsUsed) return 1;
        return 0;
      });

    for (const staffId of candidates) {
      if (!isStaffFreeForRange(ctx, staffId, segment.start, segment.end)) {
        continue;
      }

      current.push({
        professionalId: staffId,
        serviceId: segment.serviceId,
        category: segment.category,
        start: segment.start,
        end: segment.end,
      });
      backtrack(index + 1, current);
      current.pop();
    }
  };

  backtrack(0, []);

  if (!bestPlan) return null;

  const resolvedPlan: PlanRow[] = bestPlan;
  return resolvedPlan.map((row) => ({
    professionalId: row.professionalId,
    serviceId: row.serviceId,
    start: row.start,
    end: row.end,
  }));
};

const collectDayContext = async ({
  shopId,
  date,
  serviceIds,
  professionalId,
  window,
}: {
  shopId: string;
  date: Date;
  serviceIds: string[];
  professionalId?: string;
  window?: ReadWindow;
}): Promise<DayContext> => {
  const [business, services] = await Promise.all([
    readOnce(window, 'business', () => Business.findById(shopId).lean()),
    readOnce(window, 'services', () => Service.find({ _id: { $in: serviceIds }, businessId: shopId, isActive: { $ne: false } }).lean()),
  ]);
  if (!business) {
    throw new ApiError(404, "Shop not found");
  }

  if (services.length !== serviceIds.length) {
    throw new ApiError(
      404,
      "One or more services were not found for this shop",
    );
  }

  const serviceById = new Map(
    services.map((service) => [String(service._id), service]),
  );

  const orderedServices: ServiceStep[] = serviceIds.map((serviceId) => {
    const service = serviceById.get(serviceId);
    if (!service) {
      throw new ApiError(404, "Service not found");
    }

    return {
      serviceId,
      duration: Number(service.duration),
      category: String(
        (service as { category?: unknown }).category || "general",
      ),
    };
  });

  const totalDuration = orderedServices.reduce(
    (sum, service) => sum + service.duration,
    0,
  );

  const slotInterval =
    Number((business as { slotInterval?: unknown }).slotInterval) ||
    DEFAULT_SLOT_INTERVAL;
  const bookingBuffer = business.type === "independent"
    ? (business.bookingBufferMinutes ?? DEFAULT_BOOKING_BUFFER_MINUTES)
    : DEFAULT_BOOKING_BUFFER_MINUTES;
  const openingTime = String(
    (business as { openingTime?: unknown }).openingTime || DEFAULT_OPENING_TIME,
  );
  const closingTime = String(
    (business as { closingTime?: unknown }).closingTime || DEFAULT_CLOSING_TIME,
  );

  const openingMinutes = toMinutes(openingTime);
  const closingMinutes = toMinutes(closingTime);

  if (openingMinutes >= closingMinutes) {
    throw new ApiError(400, "Invalid shop opening/closing hours");
  }

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  let ownerAlias: string | undefined;
  if (business.type === "independent") {
    const owner = await readOnce(window, 'independentOwner', () => User.findById(business.ownerId).select('firebaseUid').lean());
    ownerAlias = owner?.firebaseUid;
    if (professionalId && ![String(business.ownerId), ownerAlias].includes(professionalId)) throw new ApiError(404, "Independent professional not found");
    // ownerId is the solo professional for independents
    // cast to string to ensure consistent matching
    // downstream logic will validate existence/activeness as needed
    // but availability should consider owner as the only staff
    // This makes professionalId optional for independents in client requests
    // and causes the availability engine to use the owner schedule.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    professionalId = String((business as { ownerId?: unknown }).ownerId);
  }

  const staffFilter: Record<string, unknown> = {
    businessId: shopId,
    isActive: true,
    isBookableInCalendar: { $ne: false },
    ...(business.type === "shop" ? { isOnlineVisible: { $ne: false } } : {}),
  };
  if (business.type === "independent") {
    staffFilter["staffId"] = { $in: [String(business.ownerId), ownerAlias].filter(Boolean) };
  } else if (professionalId) {
    staffFilter["staffId"] = professionalId;
  }

  const staffMembers = await readOnce(window, 'staff', () => StaffProfile.find(staffFilter).lean());
  const staffIds = business.type === "independent" ? [String(business.ownerId)] : staffMembers.map((staff) => String(staff.staffId));
  const readStaffIds = business.type === "independent" ? [...new Set([...staffIds, ownerAlias].filter((id): id is string => Boolean(id)))] : staffIds;
  const normalizeStaff = (id: string) => business.type === "independent" && readStaffIds.includes(id) ? String(business.ownerId) : id;

  if (professionalId && staffIds.length === 0) {
    throw new ApiError(404, "Professional not found or inactive");
  }

  const staffServices = new Map<string, Set<string>>();
  for (const staff of staffMembers) {
    staffServices.set(
      String(staff.staffId),
      getStaffServiceSet(staff.services),
    );
  }
  if (business.type === "independent") staffServices.set(String(business.ownerId), new Set(services.map(service => String(service._id))));

  if (staffIds.length === 0) {
    return {
      dayStart,
      slotInterval,
      openingMinutes,
      closingMinutes,
      totalDuration,
      orderedServices,
      staffIds,
      staffServices,
      availabilityByStaff: new Map(),
      bookingConflictsByStaff: new Map(),
      absencesByStaff: new Map(),
      professionalId,
    };
  }

  const dayOfWeek = dayOfWeekFromDate(dayStart);

  const readStart = window?.start || dayStart;
  const readEnd = window?.end || dayEnd;
  const [allAvailabilityRows, bookingRows, absenceRows] = await Promise.all([
    readOnce(window, 'availability', () => Availability.find({ staffId: { $in: readStaffIds }, ...(window ? {} : { dayOfWeek }) }).lean()),
    readOnce(window, 'bookings', () => Booking.find({
      businessId: shopId,
      $or: [
        { staffId: { $in: readStaffIds } },
        { "staffPlan.staffId": { $in: readStaffIds } },
      ],
      status: { $in: ["confirmed", "pending"] },
      startTime: {
        $lt: new Date(
          readEnd.getTime() + bookingBuffer * 60 * 1000,
        ),
      },
      endTime: {
        $gt: new Date(
          readStart.getTime() - bookingBuffer * 60 * 1000,
        ),
      },
    }).select('staffId staffPlan startTime endTime').lean()),
    readOnce(window, 'absences', () => Absence.find({
      staffId: { $in: readStaffIds },
      startTime: { $lt: readEnd },
      endTime: { $gt: readStart },
    }).select('staffId startTime endTime').lean()),
  ]);
  const canonicalSchedule = business.type === "independent" && allAvailabilityRows.some(row => String(row.staffId) === String(business.ownerId));
  const closed = business.type === "independent" && business.weeklySchedule?.some(day => day.dayOfWeek === dayOfWeek && !day.isOpen);
  const availabilityRows = closed ? [] : allAvailabilityRows.filter(row => row.dayOfWeek === dayOfWeek && (!canonicalSchedule || String(row.staffId) === String(business.ownerId)));

  // If there are no availability rows for this day across the staff set,
  // treat the shop/day as hard-closed and return a context flag.
  if (!availabilityRows.length) {
    return {
      dayStart,
      slotInterval,
      openingMinutes,
      closingMinutes,
      totalDuration,
      orderedServices,
      staffIds,
      staffServices: new Map(),
      availabilityByStaff: new Map(),
      bookingConflictsByStaff: new Map(),
      absencesByStaff: new Map(),
      professionalId,
      isClosedDay: true,
    };
  }

  const availabilityByStaff = new Map<
    string,
    Array<{ start: number; end: number }>
  >();
  for (const row of availabilityRows) {
    const key = normalizeStaff(String(row.staffId));
    const list = availabilityByStaff.get(key) || [];
    list.push({ start: toMinutes(row.startTime), end: toMinutes(row.endTime) });
    availabilityByStaff.set(key, list);
  }

  const bookingConflictsByStaff = new Map<
    string,
    Array<{ start: number; end: number }>
  >();
  for (const row of bookingRows) {
    const interval = normalizeInterval(
      diffMinutes(new Date(row.startTime), dayStart) -
        bookingBuffer,
      diffMinutes(new Date(row.endTime), dayStart) +
        bookingBuffer,
    );

    if (!interval) continue;

    const involvedStaffIds = new Set<string>();
    const primaryStaffId = normalizeStaff(String(row.staffId));
    if (primaryStaffId && staffServices.has(primaryStaffId)) {
      involvedStaffIds.add(primaryStaffId);
    }

    if (Array.isArray((row as { staffPlan?: unknown[] }).staffPlan)) {
      for (const planItem of (row as { staffPlan: Array<{ staffId?: string }> })
        .staffPlan) {
        const planStaffId = normalizeStaff(String(planItem.staffId || ""));
        if (planStaffId && staffServices.has(planStaffId)) {
          involvedStaffIds.add(planStaffId);
        }
      }
    }

    for (const staffId of involvedStaffIds) {
      const list = bookingConflictsByStaff.get(staffId) || [];
      list.push(interval);
      bookingConflictsByStaff.set(staffId, list);
    }
  }

  const absencesByStaff = new Map<
    string,
    Array<{ start: number; end: number }>
  >();
  for (const row of absenceRows) {
    const key = normalizeStaff(String(row.staffId));
    const interval = normalizeInterval(
      diffMinutes(new Date(row.startTime), dayStart),
      diffMinutes(new Date(row.endTime), dayStart),
    );

    if (!interval) continue;
    const list = absencesByStaff.get(key) || [];
    list.push(interval);
    absencesByStaff.set(key, list);
  }

  return {
    dayStart,
    slotInterval,
    openingMinutes,
    closingMinutes,
    totalDuration,
    orderedServices,
    staffIds,
    staffServices,
    availabilityByStaff,
    bookingConflictsByStaff,
    absencesByStaff,
    professionalId,
    earliestBookingTime: business.type === "independent" ? Date.now() + (business.minimumNoticeMinutes ?? 0) * 60000 : undefined,
  };
};

const computeAvailableSlotsForDate = async ({
  shopId,
  date,
  serviceIds,
  professionalId,
  window,
}: {
  shopId: string;
  date: Date;
  serviceIds: string[];
  professionalId?: string;
  window?: ReadWindow;
}): Promise<{ availableSlots: AvailableSlot[]; isClosedDay?: boolean }> => {
  const ctx = await collectDayContext({
    shopId,
    date,
    serviceIds,
    professionalId,
    window,
  });

  if (ctx.isClosedDay) {
    return { availableSlots: [], isClosedDay: true };
  }

  if (ctx.staffIds.length === 0) {
    return { availableSlots: [], isClosedDay: false };
  }

  const now = new Date();
  const nowIsSameDay = formatDateOnly(now) === formatDateOnly(ctx.dayStart);
  const nowMinutes = toMinutes(
    `${now.getHours()}`.padStart(2, "0") +
      ":" +
      `${now.getMinutes()}`.padStart(2, "0"),
  );
  const availableSlots: AvailableSlot[] = [];

  for (
    let start = ctx.openingMinutes;
    start + ctx.totalDuration <= ctx.closingMinutes;
    start += ctx.slotInterval
  ) {
    if (nowIsSameDay && start <= nowMinutes) {
      continue;
    }
    if (ctx.earliestBookingTime && toDateAtMinutes(ctx.dayStart, start).getTime() < ctx.earliestBookingTime) continue;

    const blockEnd = start + ctx.totalDuration;
    if (blockEnd > ctx.closingMinutes) {
      continue;
    }

    const segments = buildServiceSegments(start, ctx.orderedServices);

    let plan: Array<{
      professionalId: string;
      serviceId: string;
      start: number;
      end: number;
    }> | null = null;

    if (ctx.professionalId) {
      const staffId = ctx.professionalId;
      const canDoAll = ctx.orderedServices.every((service) =>
        canHandleService(ctx.staffServices, staffId, service.serviceId),
      );

      if (!canDoAll) {
        continue;
      }

      if (!isStaffFreeForRange(ctx, staffId, start, blockEnd)) {
        continue;
      }

      plan = segments.map((segment) => ({
        professionalId: staffId,
        serviceId: segment.serviceId,
        start: segment.start,
        end: segment.end,
      }));
    } else {
      plan = findSingleStaffPlan(ctx, segments);
      if (!plan) {
        plan = findBestChainPlan(ctx, segments);
      }
    }

    if (!plan) continue;

    availableSlots.push({
      date: formatDateOnly(ctx.dayStart),
      startTime: toDateAtMinutes(ctx.dayStart, start).toISOString(),
      staffPlan: toPlanResponse(ctx.dayStart, plan),
    });
  }

  return { availableSlots };
};

const findNextAvailableDate = async ({
  shopId,
  baseDate,
  serviceIds,
  professionalId,
}: {
  shopId: string;
  baseDate: Date;
  serviceIds: string[];
  professionalId?: string;
}): Promise<string | undefined> => {
  for (let i = 1; i <= SEARCH_WINDOW_DAYS; i += 1) {
    const nextDate = new Date(baseDate);
    nextDate.setDate(baseDate.getDate() + i);
    const { availableSlots } = await computeAvailableSlotsForDate({
      shopId,
      date: nextDate,
      serviceIds,
      professionalId,
    });

    if (availableSlots.length > 0) {
      return formatDateOnly(nextDate);
    }
  }

  return undefined;
};

export const getAvailableSlots = async (input: {
  shopId: string;
  date: string;
  serviceIds: string[];
  professionalId?: string | null;
  /** When true, skip the expensive 30-day next-available scan (used for strip prefetch). */
  skipNextAvailable?: boolean;
}): Promise<AvailableSlotResponse> => {
  if (!input.serviceIds.length) {
    throw new ApiError(400, "serviceIds must contain at least one service");
  }

  const date = parseDateInput(input.date);
  const normalizedServiceIds = input.serviceIds.map(String);
  const professionalId = input.professionalId
    ? String(input.professionalId)
    : undefined;
  const skipNextSearch = Boolean(input.skipNextAvailable);

  const { availableSlots, isClosedDay } = await computeAvailableSlotsForDate({
    shopId: String(input.shopId),
    date,
    serviceIds: normalizedServiceIds,
    professionalId,
  });

  if (availableSlots.length > 0) {
    return {
      availableSlots,
      isFullyBooked: false,
    };
  }

  if (isClosedDay || skipNextSearch) {
    return {
      availableSlots: [],
      isFullyBooked: true,
    };
  }

  const nextAvailableDate = await findNextAvailableDate({
    shopId: String(input.shopId),
    baseDate: date,
    serviceIds: normalizedServiceIds,
    professionalId,
  });

  return {
    availableSlots: [],
    isFullyBooked: true,
    nextAvailableDate,
  };
};

export const getAvailableSlotsRange = async (input: {
  shopId: string;
  date: string;
  days: number;
  serviceIds: string[];
  professionalId?: string | null;
}) => {
  if (!input.serviceIds.length || !Number.isInteger(input.days) || input.days < 1 || input.days > 7) {
    throw new ApiError(400, "Select services and a range of 1 to 7 days");
  }
  const start = parseDateInput(input.date);
  const end = new Date(start);
  end.setDate(end.getDate() + input.days);
  const window: ReadWindow = { start, end, reads: new Map() };
  const days = await Promise.all(Array.from({ length: input.days }, async (_, index) => {
    const day = new Date(start);
    day.setDate(day.getDate() + index);
    const result = await computeAvailableSlotsForDate({
      shopId: input.shopId,
      date: day,
      serviceIds: input.serviceIds,
      professionalId: input.professionalId || undefined,
      window,
    });
    return { date: formatDateOnly(day), ...result, isFullyBooked: result.availableSlots.length === 0 };
  }));
  return { days };
};
