import api from "./instance";

// --- Templates ---
export interface Template {
  id: string;
  name: string;
  subject_line: string;
  body_html: string;
  user_id?: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export const getTemplates = () =>
  api.get<Template[]>("/templates/").then((r) => r.data);

export const getTemplate = (id: string) =>
  api.get<Template>(`/templates/${id}`).then((r) => r.data);

export const createTemplate = (data: Partial<Template>) =>
  api.post<Template>("/templates/", data).then((r) => r.data);

export const updateTemplate = (id: string, data: Partial<Template>) =>
  api.put<Template>(`/templates/${id}`, data).then((r) => r.data);

export const deleteTemplate = (id: string) =>
  api.delete(`/templates/${id}`).then((r) => r.data);

export const setTemplateDefault = (id: string) =>
  api.put<Template>(`/templates/${id}/set-default`).then((r) => r.data);

export const previewTemplate = (id: string, data: Record<string, string>) =>
  api
    .post<{ subject: string; body: string }>(`/templates/${id}/preview`, data)
    .then((r) => r.data);
