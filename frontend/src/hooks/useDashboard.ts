import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';
import { BookingStatus } from '@/types';

export function useDashboardSummary(shopId: string) {
  return useQuery({
    queryKey: ['dashboardSummary', shopId],
    queryFn: () => dashboardService.getSummary(shopId),
    enabled: !!shopId,
  });
}

export function useBookings(shopId: string, params?: { status?: BookingStatus }) {
  return useQuery({
    queryKey: ['bookings', shopId, params],
    queryFn: () => dashboardService.getBookings(shopId, params),
    enabled: !!shopId,
  });
}

export function useUpdateBookingStatus(shopId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bookingId, status }: { bookingId: string; status: BookingStatus }) =>
      dashboardService.updateBookingStatus(shopId, bookingId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary', shopId] });
      queryClient.invalidateQueries({ queryKey: ['bookings', shopId] });
    },
  });
}

export function useCancelBooking(shopId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason?: string }) =>
      dashboardService.cancelBooking(shopId, bookingId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary', shopId] });
      queryClient.invalidateQueries({ queryKey: ['bookings', shopId] });
    },
  });
}
