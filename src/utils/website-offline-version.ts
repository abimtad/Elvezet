import { createHash } from 'node:crypto';

// Notification housekeeping changes updatedAt after a booking is returned.
// Compare business content, not that housekeeping timestamp, on offline sync.
export function bookingOfflineVersion(booking: any): string {
  const id = (value: any) => value == null ? null : String(value._id ?? value);
  const date = (value: any) => value ? new Date(value).toISOString() : null;
  return createHash('sha256').update(JSON.stringify({
    businessId: id(booking.businessId), status: booking.status, paymentStatus: booking.paymentStatus,
    startTime: date(booking.startTime), endTime: date(booking.endTime), staffId: id(booking.staffId),
    serviceIds: (booking.serviceIds || []).map(id),
    staffPlan: (booking.staffPlan || []).map((segment: any) => ({ staffId: id(segment.staffId), serviceId: id(segment.serviceId), startTime: date(segment.startTime), endTime: date(segment.endTime) })),
    totalAmount: booking.totalAmount, tipAmount: booking.tipAmount ?? 0,
    appointmentNotes: booking.appointmentNotes ?? '', paymentMethod: booking.paymentMethod,
    completedAt: date(booking.completedAt), paidAt: date(booking.paidAt), priceOverride: booking.priceOverride ?? null,
  })).digest('hex');
}
