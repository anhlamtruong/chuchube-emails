import api from "./instance";
import type { Paginated } from "./types";

/**
 * Shared contact interface — Recruiters and Referrals have identical shapes.
 */
export interface Contact {
  id: string;
  name: string;
  email: string;
  company: string;
  title: string;
  location: string;
  notes: string;
  email_status: string;
  created_at: string;
  updated_at: string;
}

/**
 * API factory for contact-like entities (recruiters, referrals).
 * Returns typed CRUD functions for the given endpoint.
 */
export function createContactApi<T extends Contact>(endpoint: string) {
  return {
    getAll: (params?: Record<string, string | number>, signal?: AbortSignal) =>
      api
        .get<Paginated<T>>(`/${endpoint}/`, { params, signal })
        .then((r) => r.data),

    getCount: () =>
      api.get<{ count: number }>(`/${endpoint}/count`).then((r) => r.data),

    create: (data: Partial<T>) =>
      api.post<T>(`/${endpoint}/`, data).then((r) => r.data),

    update: (id: string, data: Partial<T>) =>
      api.put<T>(`/${endpoint}/${id}`, data).then((r) => r.data),

    delete: (id: string) =>
      api.delete(`/${endpoint}/${id}`).then((r) => r.data),
  };
}
