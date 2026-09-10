/** Keep the row's label and available actions consistent with dashboard filters. */
export function bookingDisplayStatus(booking: { status?: string; computedStatus?: string }): string {
  const status = booking.status === 'no-show' ? 'no_show' : booking.status || 'pending';
  return status === 'confirmed' && booking.computedStatus === 'completed' ? 'completed' : status;
}

/** Normalize service id entries from API (populated docs, raw ObjectIds, or strings). */
export function extractServiceIdsFromBooking(booking: {
  serviceIds?: Array<{ _id?: string } | string>;
  serviceId?: { _id?: string } | string;
  staffPlan?: Array<{ serviceId?: { _id?: string } | string }>;
}): string[] {
  const fromList = (booking.serviceIds || [])
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object' && entry._id) return String(entry._id);
      return '';
    })
    .filter(Boolean);

  if (fromList.length > 0) return fromList;

  const single = booking.serviceId;
  if (single) {
    if (typeof single === 'string') return [single];
    if (typeof single === 'object' && single._id) return [String(single._id)];
  }

  const fromPlan = (booking.staffPlan || [])
    .map((row) => {
      const sid = row.serviceId;
      if (!sid) return '';
      if (typeof sid === 'string') return sid;
      if (typeof sid === 'object' && sid._id) return String(sid._id);
      return '';
    })
    .filter(Boolean);

  return [...new Set(fromPlan)];
}

export function normalizeServiceIdsField(
  raw: unknown,
): Array<{
  _id: string;
  name?: string;
  duration?: number;
  basePrice?: number;
  category?: string;
  categoryName?: string;
}> {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  return raw
    .map((entry) => {
      if (typeof entry === 'string') {
        return { _id: entry };
      }
      if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        const id = String(obj._id || obj.id || '');
        if (!id) return null;
        return {
          _id: id,
          name: typeof obj.name === 'string' ? obj.name : undefined,
          duration: typeof obj.duration === 'number' ? obj.duration : undefined,
          basePrice: typeof obj.basePrice === 'number' ? obj.basePrice : undefined,
          category: typeof obj.category === 'string' ? obj.category : undefined,
          categoryName:
            typeof obj.categoryName === 'string' ? obj.categoryName : undefined,
        };
      }
      return null;
    })
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
}
