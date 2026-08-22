import { useQuery } from '@tanstack/react-query';
import { businessService } from '@/services/business.service';

export function useBusinesses() {
  return useQuery({
    queryKey: ['businesses'],
    queryFn: businessService.listBusinesses,
  });
}

export function useBusiness(id: string) {
  return useQuery({
    queryKey: ['business', id],
    queryFn: () => businessService.getBusiness(id),
    enabled: !!id,
  });
}

export function useBusinessServices(id: string) {
  return useQuery({
    queryKey: ['business-services', id],
    queryFn: () => businessService.getBusinessServices(id),
    enabled: !!id,
  });
}

export function useBusinessStaff(id: string) {
  return useQuery({
    queryKey: ['business-staff', id],
    queryFn: () => businessService.getBusinessStaff(id),
    enabled: !!id,
  });
}

export function useReviews(id: string) {
  return useQuery({
    queryKey: ['reviews', id],
    queryFn: () => businessService.getReviews(id),
    enabled: !!id,
  });
}
