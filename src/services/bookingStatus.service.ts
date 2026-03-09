export type BookingComputedStatus =
  | "pending"
  | "upcoming"
  | "in-progress"
  | "completed"
  | "cancelled"
  | "expired"
  | "no-show";

export type BookingStatusLike = {
  status: string;
  startTime: Date | string;
  endTime: Date | string;
  completedAt?: Date | string | null;
};

const toDate = (value: Date | string): Date =>
  value instanceof Date ? value : new Date(value);

export const getBookingComputedStatus = (
  booking: BookingStatusLike,
  now: Date = new Date(),
): BookingComputedStatus => {
  if (booking.status === "pending") return "pending";
  if (booking.status === "cancelled") return "cancelled";
  if (booking.status === "expired") return "expired";
  if (booking.status === "no-show" || booking.status === "no_show") {
    return "no-show";
  }
  if (booking.status === "completed" || booking.completedAt) return "completed";

  const start = toDate(booking.startTime).getTime();
  const end = toDate(booking.endTime).getTime();
  const nowTime = now.getTime();

  if (nowTime < start) return "upcoming";
  if (nowTime < end) return "in-progress";
  return "completed";
};
