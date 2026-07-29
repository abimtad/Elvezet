export type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

export type PaymentMethod = "cash" | "in-shop";
export type PaymentStatus = "unpaid" | "paid";

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: "customer" | "owner" | "admin";
  phoneNumber?: string;
  avatarUrl?: string;
}

export interface Business {
  id: string;
  _id?: string;
  name: string;
  type?: "shop" | "independent";
  businessCategoryId?: string;
  businessCategoryName?: string;
  primaryCategory?: string;
  productsEnabled?: boolean;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  ownerId: string;
  rating: number;
  cancellationWindowMinutes: number;
  description?: string;
  genderTarget?: 'male' | 'female' | 'all' | 'unknown';
  audienceNeedsReview?: boolean;
  addressString?: string;
  openingTime?: string;
  closingTime?: string;
  weeklySchedule?: Array<{
    dayOfWeek: number;
    dayLabel?: string;
    isOpen?: boolean;
    isClosed?: boolean;
    openingTime?: string;
    closingTime?: string;
    hours?: string;
  }>;
  logoUrl?: string;
  coverImageUrl?: string;
  instagramUrl?: string;
  tiktokUrls?: string[];
  galleryUrls?: string[];
  mediaLinks?: string[];
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type StaffPresenceStatus = "online" | "offline" | "busy";

export interface StaffStatRow {
  staffId: string;
  name: string;
  totalServicesProvided: number;
  mostBookedService: string | null;
  totalHoursWorked: number;
  isOnlineVisible: boolean;
  presenceStatus: StaffPresenceStatus;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  businessId: string;
}

export interface StaffProfile {
  id: string;
  userId: string;
  businessId: string;
  name: string;
  specialties: string[];
  bio?: string;
}

export interface Booking {
  id: string;
  userId: string | User;
  businessId: string | Business;
  staffId: string | StaffProfile;
  serviceId: string | Service;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  totalBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  completedBookings: number;
  revenue: number;
  recentBookings: Booking[];
}
