import api from "./instance";
import type { Paginated } from "./types";

// --- Campaigns ---
export interface Campaign {
  id: string;
  sender_email: string;
  recipient_name: string;
  recipient_email: string;
  company: string;
  position: string;
  template_file: string;
  framework: string;
  my_strength: string;
  audience_value: string;
  custom_fields: Record<string, string> | null;
  sent_status: string;
  sent_at: string | null;
  scheduled_at: string | null;
  recruiter_id: string | null;
  referral_id: string | null;
  created_at: string;
  updated_at: string;
}

export const getCampaigns = (params?: Record<string, string | number>) =>
  api.get<Paginated<Campaign>>("/campaigns/", { params }).then((r) => r.data);

export const getCustomColumns = () =>
  api
    .get<{ columns: string[] }>("/campaigns/custom-columns")
    .then((r) => r.data.columns);

// --- Custom Column Definitions ---
export interface CustomColumnDefinition {
  id: string;
  user_id: string;
  name: string;
  default_value: string;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
}

export const getCustomColumnDefinitions = () =>
  api.get<CustomColumnDefinition[]>("/custom-columns/").then((r) => r.data);

export const createCustomColumnDefinition = (data: {
  name: string;
  default_value?: string;
  sort_order?: number;
}) =>
  api
    .post<CustomColumnDefinition>("/custom-columns/", data)
    .then((r) => r.data);

export const updateCustomColumnDefinition = (
  id: string,
  data: { name?: string; default_value?: string; sort_order?: number },
) =>
  api
    .put<CustomColumnDefinition>(`/custom-columns/${id}`, data)
    .then((r) => r.data);

export const deleteCustomColumnDefinition = (id: string) =>
  api.delete(`/custom-columns/${id}`).then((r) => r.data);

export const reorderCustomColumns = (order: string[]) =>
  api.put("/custom-columns/reorder/bulk", order).then((r) => r.data);

export const getCampaignCount = () =>
  api
    .get<{
      total: number;
      by_status: Record<string, number>;
    }>("/campaigns/count")
    .then((r) => r.data);

export const createCampaign = (data: Partial<Campaign>) =>
  api.post<Campaign>("/campaigns/", data).then((r) => r.data);

export const updateCampaign = (id: string, data: Partial<Campaign>) =>
  api.put<Campaign>(`/campaigns/${id}`, data).then((r) => r.data);

export const bulkUpdateCampaigns = (
  rows: Array<Partial<Campaign> & { id: string }>,
) => api.put("/campaigns/bulk/update", rows).then((r) => r.data);

export const deleteCampaign = (id: string) =>
  api.delete(`/campaigns/${id}`).then((r) => r.data);

// --- Campaign Generation ---
export const generateFromRecruiters = (data: {
  recruiter_ids: string[];
  sender_email: string;
  template_file: string;
  position?: string;
  custom_field_overrides?: Record<string, string>;
}) => api.post("/campaigns/generate-from-recruiters", data).then((r) => r.data);

export const generateFromReferrals = (data: {
  referral_ids: string[];
  sender_email: string;
  template_file: string;
  position?: string;
  custom_field_overrides?: Record<string, string>;
}) => api.post("/campaigns/generate-from-referrals", data).then((r) => r.data);

export const bulkPasteCampaigns = (data: {
  rows: Array<{
    name: string;
    email: string;
    title: string;
    company: string;
    location: string;
    notes: string;
  }>;
  sender_email: string;
  template_file: string;
  position?: string;
  custom_field_overrides?: Record<string, string>;
}) => api.post("/campaigns/bulk-paste", data).then((r) => r.data);
