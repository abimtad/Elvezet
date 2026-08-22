import api from "@/lib/axios";
import { DashboardSummary, Booking, BookingStatus, StaffStatRow } from "@/types";

export type BookingFilterStatus = BookingStatus | 'expired' | 'no-show' | 'upcoming' | 'in-progress';
export type DashboardBookingsPage = { bookings: Booking[]; total: number; page: number; totalPages: number };

const unwrapData = <T>(payload: unknown): T => {
  const wrapped = payload as { data?: T };
  return (wrapped?.data ?? payload) as T;
};

export const dashboardService = {
  getOwnerStaff: async (shopId: string): Promise<any[]> => {
    const response = await api.get(`/dashboard/${shopId}/staff`);
    return unwrapData<any[]>(response.data);
  },
  getBookingsPage: async (shopId: string, params: {
    status?: BookingFilterStatus; date?: string; page?: number; limit?: number;
  }): Promise<DashboardBookingsPage> => {
    const response = await api.get(`/dashboard/${shopId}/bookings`, { params });
    return unwrapData<DashboardBookingsPage>(response.data);
  },
  getSummary: async (shopId: string): Promise<DashboardSummary> => {
    const response = await api.get(`/dashboard/${shopId}/dashboard`);
    return unwrapData<DashboardSummary>(response.data);
  },

  getBookings: async (
    shopId: string,
    params?: {
      status?: BookingFilterStatus;
      startDate?: string;
      endDate?: string;
      date?: string;
    }
  ): Promise<Booking[]> => {
    const response = await api.get(`/dashboard/${shopId}/bookings`, { params });
    const payload = unwrapData<{ bookings?: Booking[] } | Booking[]>(response.data);
    return Array.isArray(payload) ? payload : payload.bookings || [];
  },

  updateBookingStatus: async (
    shopId: string,
    bookingId: string,
    status: BookingStatus
  ): Promise<Booking> => {
    const response = await api.patch(
      `/dashboard/${shopId}/bookings/${bookingId}/status`,
      { status }
    );
    return unwrapData<Booking>(response.data);
  },

  cancelBooking: async (
    shopId: string,
    bookingId: string,
    reason?: string
  ): Promise<Booking> => {
    const response = await api.patch(
      `/dashboard/${shopId}/bookings/${bookingId}/cancel`,
      { reason: reason || "" }
    );
    return unwrapData<Booking>(response.data);
  },

  listCustomers: async (shopId: string): Promise<unknown> => {
    const response = await api.get(`/dashboard/${shopId}/customers`);
    return unwrapData(response.data);
  },

  getRevenue: async (shopId: string, range: string = 'day', date?: string): Promise<{
    total: number;
    cash: number;
    bankTransfer: number;
    completedBookings: number;
    range: string;
    from: string;
    to: string;
  }> => {
    const response = await api.get(`/dashboard/${shopId}/revenue`, { params: { range, date } });
    return unwrapData(response.data);
  },

  getEndOfDay: async (
    shopId: string,
    date?: string,
  ): Promise<{
    date: string;
    shopName: string;
    cashTotal: number;
    bankTransferTotal: number;
    platformTotal: number;
    platformCount: number;
    walkInTotal: number;
    walkInCount: number;
    grandTotal: number;
    paidBookingsCount: number;
    transactions: Array<{
      id: string;
      clientName: string;
      staffName: string;
      services: string;
      amount: number;
      paymentMethod: string;
      isWalkIn: boolean;
      startTime: string;
    }>;
  }> => {
    const response = await api.get(`/dashboard/${shopId}/end-of-day`, { params: { date } });
    return unwrapData(response.data);
  },

  getAnalytics: async (
    shopId: string,
    range: 'day' | 'week' | 'month' = 'week',
    date?: string,
  ): Promise<{
    range: string;
    from: string;
    to: string;
    revenue: {
      total: number;
      cash: number;
      bankTransfer: number;
      previousPeriodTotal: number;
      changePercent: number;
    };
    bookings: {
      total: number;
      paid: number;
      walkIn: number;
      platform: number;
      cancelled: number;
      noShow: number;
      averageTicket: number;
    };
    staffPerformance: Array<{
      staffId: string;
      name: string;
      role: string;
      avatarUrl: string;
      bookings: number;
      revenue: number;
      performanceScore: number;
    }>;
    topServices: Array<{ name: string; count: number; revenue: number }>;
    peakHours: Array<{ hour: number; count: number }>;
    recentBookings: Array<{
      id: string;
      customerName: string;
      serviceName: string;
      bookingDate: string;
      staffName: string;
      status: string;
    }>;
  }> => {
    const response = await api.get(`/dashboard/${shopId}/analytics`, { params: { range, date } });
    return unwrapData(response.data);
  },

  uploadProductImage: async (
    shopId: string,
    file: File,
  ): Promise<{ imageUrl: string; publicUrl: string }> => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await api.post(`/dashboard/${shopId}/products/upload-image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrapData(response.data);
  },

  getProducts: async (shopId: string): Promise<any[]> => {
    const response = await api.get(`/dashboard/${shopId}/products`);
    return unwrapData<any[]>(response.data);
  },

  searchClients: async (shopId: string, query: string): Promise<{ clients: any[] }> => {
    const response = await api.get(`/dashboard/${shopId}/clients/search`, { params: { query } });
    return unwrapData<{ clients: any[] }>(response.data);
  },

  createWalkIn: async (shopId: string, data: any): Promise<any> => {
    const response = await api.post(`/dashboard/${shopId}/walk-in`, data);
    return unwrapData(response.data);
  },

  checkoutBooking: async (
    bookingId: string,
    data: {
      products: Array<{ productId: string; quantity: number }>;
      paymentMethod: string;
      priceOverride?: number;
      tip?: number;
    },
  ): Promise<any> => {
    const response = await api.patch(`/bookings/${bookingId}/checkout`, data);
    return unwrapData(response.data);
  },

  updateBookingAppointment: async (
    shopId: string,
    bookingId: string,
    data: {
      appointmentNotes?: string;
      serviceIds?: string[];
      tipAmount?: number;
    },
  ): Promise<any> => {
    const response = await api.patch(`/dashboard/${shopId}/bookings/${bookingId}`, data);
    return unwrapData(response.data);
  },

  getReceipt: async (bookingId: string): Promise<{ receipt: string }> => {
    const response = await api.get(`/bookings/${bookingId}/receipt`);
    return unwrapData(response.data);
  },

  createService: async (shopId: string, data: any): Promise<any> => {
    const response = await api.post(`/dashboard/${shopId}/services`, data);
    return unwrapData(response.data);
  },

  createProduct: async (shopId: string, data: any): Promise<any> => {
    const response = await api.post(`/dashboard/${shopId}/products`, data);
    return unwrapData(response.data);
  },

  updateService: async (
    shopId: string,
    serviceId: string,
    data: {
      name?: string;
      categoryName?: string;
      duration?: number;
      basePrice?: number;
    }
  ): Promise<any> => {
    const response = await api.patch(`/dashboard/${shopId}/services/${serviceId}`, data);
    return unwrapData(response.data);
  },

  deleteService: async (shopId: string, serviceId: string): Promise<void> => {
    await api.delete(`/dashboard/${shopId}/services/${serviceId}`);
  },

  updateProduct: async (
    shopId: string,
    productId: string,
    data: {
      name?: string;
      brand?: string;
      price?: number;
      stockQuantity?: number;
      minStockAlert?: number;
    }
  ): Promise<any> => {
    const response = await api.patch(`/dashboard/${shopId}/products/${productId}`, data);
    return unwrapData(response.data);
  },

  deleteProduct: async (shopId: string, productId: string): Promise<void> => {
    await api.delete(`/dashboard/${shopId}/products/${productId}`);
  },

  createStaff: async (shopId: string, data: Record<string, unknown>): Promise<unknown> => {
    const response = await api.post(`/dashboard/${shopId}/staff`, data);
    return unwrapData(response.data);
  },

  updateStaff: async (
    shopId: string,
    staffId: string,
    data: Record<string, unknown>,
  ): Promise<unknown> => {
    const response = await api.patch(`/dashboard/${shopId}/staff/${staffId}`, data);
    return unwrapData(response.data);
  },

  archiveStaff: async (shopId: string, staffId: string): Promise<unknown> => {
    const response = await api.patch(`/dashboard/${shopId}/staff/${staffId}/archive`);
    return unwrapData(response.data);
  },

  rescheduleBooking: async (
    bookingId: string,
    data: { startTime: string; endTime: string; staffId?: string },
  ): Promise<Booking> => {
    const response = await api.patch(`/bookings/${bookingId}/reschedule`, data);
    return unwrapData<Booking>(response.data);
  },

  getClientHistory: async (
    shopId: string,
    clientId: string,
  ): Promise<{
    client: {
      _id: string;
      fullName: string;
      phoneNumber: string;
      email?: string;
      notes?: string;
      totalSpend: number;
      lastVisit?: string;
      totalVisits: number;
    };
    recentBookings: Array<{
      _id: string;
      startTime: string;
      endTime: string;
      status: string;
      computedStatus: string;
      totalAmount: number;
      staffName?: string;
      services: Array<{ _id: string; name?: string; basePrice?: number }>;
    }>;
  }> => {
    const response = await api.get(`/dashboard/${shopId}/clients/${clientId}/history`);
    return unwrapData(response.data);
  },

  updateClientNotes: async (
    shopId: string,
    clientId: string,
    notes: string,
  ): Promise<unknown> => {
    const response = await api.patch(`/dashboard/${shopId}/clients/${clientId}/notes`, {
      notes,
    });
    return unwrapData(response.data);
  },

  getStaffStats: async (shopId: string): Promise<StaffStatRow[]> => {
    const response = await api.get(`/dashboard/${shopId}/staff-stats`);
    const payload = unwrapData<{ staff?: StaffStatRow[] }>(response.data);
    return payload.staff || [];
  },

  setStaffVisibility: async (
    shopId: string,
    staffId: string,
    isOnlineVisible: boolean,
  ): Promise<unknown> => {
    const response = await api.patch(`/dashboard/${shopId}/staff/${staffId}/visibility`, {
      isOnlineVisible,
    });
    return unwrapData(response.data);
  },

  uploadStaffAvatar: async (
    shopId: string,
    staffId: string,
    file: File | Blob,
  ): Promise<{ profilePicture: string }> => {
    const formData = new FormData();
    formData.append("avatar", file, "avatar.jpg");
    const response = await api.post(
      `/dashboard/${shopId}/staff/${staffId}/avatar`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return unwrapData<{ profilePicture: string }>(response.data);
  },
};
