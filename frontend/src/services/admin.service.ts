import api from "@/lib/axios";

export type TenantStatus = "active" | "suspended" | "pending";
export type TenantType = "shop" | "independent";

export type CategoryItem = {
  _id: string;
  name: string;
  isActive?: boolean;
};

export type RegisterTenantPayload = {
  smsRequested?: boolean;
  name: string;
  ownerEmail: string;
  ownerPassword: string;
  type: TenantType;
  ownerPhoneNumber?: string;
  businessCategoryId?: string;
  businessCategoryName?: string;
  latitude?: number;
  longitude?: number;
  addressString?: string;
  bufferRange?: number;
  travelRate?: number;
  minTravelFee?: number;
  idNumber?: string;
};

export interface AdminStats {
  totalRevenue: number;
  totalBookings: number;
  totalTenants: number;
  totalUsers: number;
  shopPerformance: Array<{
    businessId: string;
    name: string;
    bookings: number;
    revenue: number;
  }>;
}

export const adminService = {
  getGlobalStats: async (): Promise<AdminStats> => {
    const response = await api.get("/admin/global-stats");
    return response.data;
  },

  listTenants: async (params?: {
    status?: TenantStatus;
    type?: TenantType;
  }) => {
    const response = await api.get("/admin/tenants", { params });
    return response.data;
  },

  getVerificationQueue: async () => {
    const response = await api.get("/admin/verification-queue");
    return response.data;
  },

  listUsers: async () => {
    const response = await api.get("/admin/users");
    return response.data;
  },

  listCategories: async (): Promise<CategoryItem[]> => {
    const response = await api.get("/categories");
    return response.data;
  },

  createCategory: async (name: string): Promise<CategoryItem> => {
    const response = await api.post("/admin/categories", { name });
    return response.data;
  },

  updateCategory: async (id: string, name: string): Promise<CategoryItem> => {
    const response = await api.patch(`/admin/categories/${id}`, { name });
    return response.data;
  },

  deleteCategory: async (id: string): Promise<CategoryItem> => {
    const response = await api.delete(`/admin/categories/${id}`);
    return response.data;
  },

  registerTenant: async (data: RegisterTenantPayload) => {
    const response = await api.post("/admin/register-tenant", data);
    return response.data;
  },

  updateTenantCategory: async (
    tenantId: string,
    businessCategoryId: string,
  ) => {
    const response = await api.patch(`/admin/tenants/${tenantId}/category`, {
      businessCategoryId,
    });
    return response.data;
  },

  setTenantProductsEnabled: async (
    tenantId: string,
    productsEnabled: boolean,
  ) => {
    const response = await api.patch(
      `/admin/tenants/${tenantId}/products-enabled`,
      { productsEnabled },
    );
    return response.data;
  },

  uploadTenantIdCard: async (
    tenantId: string,
    file: File,
    idNumber?: string,
  ) => {
    const formData = new FormData();
    formData.append("image", file);
    if (idNumber) {
      formData.append("idNumber", idNumber);
    }

    const response = await api.post(`/businesses/${tenantId}/id-card`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  verifyBarber: async (tenantId: string) => {
    const response = await api.patch(`/admin/verify-barber/${tenantId}`, {});
    return response.data;
  },

  verifyTenant: async (
    tenantId: string,
    data: { idCardUrl?: string; idNumber?: string },
  ) => {
    const response = await api.patch(`/admin/tenants/${tenantId}/verify`, data);
    return response.data;
  },

  toggleBan: async (userId: string, isBanned: boolean) => {
    const response = await api.patch(`/admin/users/${userId}/ban`, { isBanned });
    return response.data;
  },

  // ── Discover (YouTube feed for BarberOS) ─────────────────
  listDiscoverCategories: async (): Promise<{ _id: string; name: string }[]> => {
    return (await api.get("/admin/discover/categories")).data;
  },
  createDiscoverCategory: async (name: string) => {
    return (await api.post("/admin/discover/categories", { name })).data;
  },
  deleteDiscoverCategory: async (id: string) => {
    return (await api.delete(`/admin/discover/categories/${id}`)).data;
  },
  listDiscoverVideos: async (): Promise<{
    categories: string[];
    videos: DiscoverVideoItem[];
  }> => {
    const response = await api.get("/admin/discover/videos");
    return response.data;
  },

  createDiscoverVideo: async (
    payload: DiscoverVideoPayload,
  ): Promise<DiscoverVideoItem> => {
    const response = await api.post("/admin/discover/videos", payload);
    return response.data;
  },

  updateDiscoverVideo: async (
    id: string,
    payload: Partial<DiscoverVideoPayload>,
  ): Promise<DiscoverVideoItem> => {
    const response = await api.patch(`/admin/discover/videos/${id}`, payload);
    return response.data;
  },

  deleteDiscoverVideo: async (id: string): Promise<DiscoverVideoItem> => {
    const response = await api.delete(`/admin/discover/videos/${id}`);
    return response.data;
  },
};

export type DiscoverVideoItem = {
  _id: string;
  title: string;
  creatorName: string;
  category: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  thumbnailUrl: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type DiscoverVideoPayload = {
  title: string;
  creatorName: string;
  category: string;
  youtubeUrl: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
};
