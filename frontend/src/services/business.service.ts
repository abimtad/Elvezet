import api from "@/lib/axios";
import { Business, Service, StaffProfile } from "@/types";

const unwrapData = <T>(payload: unknown): T => {
  const maybeWrapped = payload as { data?: T };
  return (maybeWrapped?.data ?? payload) as T;
};

const normalizeBusiness = (business: Business): Business => {
  if (business.id) return business;
  if (business._id) {
    return { ...business, id: business._id };
  }
  return business;
};

export const businessService = {
  listBusinesses: async (): Promise<Business[]> => {
    const response = await api.get("/auth/workspaces");
    const workspaces = response.data?.data?.workspaces || [];
    const payload: Business[] = await Promise.all(workspaces.filter((w: {role: string}) => ['owner','independent'].includes(w.role)).map(async (w: {businessId: string}) => {
      const result = await api.get(`/businesses/${w.businessId}`);
      return unwrapData<Business>(result.data);
    }));
    return Array.isArray(payload) ? payload.map(normalizeBusiness) : [];
  },

  getBusiness: async (id: string): Promise<Business> => {
    const response = await api.get(`/businesses/${id}`);
    return normalizeBusiness(unwrapData<Business>(response.data));
  },

  createBusiness: async (data: Partial<Business>): Promise<Business> => {
    const response = await api.post("/businesses", data);
    return normalizeBusiness(unwrapData<Business>(response.data));
  },

  getBusinessServices: async (id: string): Promise<Service[]> => {
    const response = await api.get(`/businesses/${id}/services`);
    return unwrapData<Service[]>(response.data);
  },

  getBusinessStaff: async (id: string): Promise<StaffProfile[]> => {
    const response = await api.get(`/businesses/${id}/staff`);
    return unwrapData<StaffProfile[]>(response.data);
  },

  getReviews: async (id: string) => {
    const response = await api.get(`/businesses/${id}/reviews`);
    return unwrapData(response.data);
  },

  updateBusiness: async (
    id: string,
    data: Partial<Business>,
  ): Promise<Business> => {
    const response = await api.patch(`/businesses/${id}`, data);
    return normalizeBusiness(unwrapData<Business>(response.data));
  },

  uploadBusinessLogo: async (id: string, file: File): Promise<Business> => {
    const formData = new FormData();
    formData.append("image", file);
    const response = await api.post(`/businesses/${id}/logo`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return normalizeBusiness(unwrapData<Business>(response.data));
  },

  uploadBusinessCover: async (id: string, file: File): Promise<Business> => {
    const formData = new FormData();
    formData.append("image", file);
    const response = await api.post(`/businesses/${id}/cover`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return normalizeBusiness(unwrapData<Business>(response.data));
  },

  uploadBusinessGallery: async (id: string, files: File[]): Promise<Business> => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("images", file);
    });
    const response = await api.post(`/businesses/${id}/gallery`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return normalizeBusiness(unwrapData<Business>(response.data));
  },

  deleteBusinessGalleryImage: async (
    id: string,
    imageIndex: number,
  ): Promise<Business> => {
    const response = await api.delete(`/businesses/${id}/gallery/${imageIndex}`);
    return normalizeBusiness(unwrapData<Business>(response.data));
  },
};
