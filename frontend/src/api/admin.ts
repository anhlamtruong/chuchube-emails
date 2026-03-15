import api from "./instance";

/* ------------------------------------------------------------------ */
/*  Admin                                                              */
/* ------------------------------------------------------------------ */

export interface AccessKeyItem {
  id: string;
  key_prefix: string | null;
  label: string;
  created_at: string | null;
  used_by_user_id: string | null;
  used_at: string | null;
  is_active: boolean;
}

export interface AccessKeyCreated {
  id: string;
  key: string;
  key_prefix: string;
  label: string;
  created_at: string | null;
  is_active: boolean;
}

export interface OrgAccount {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  provider: string;
  organization_name: string | null;
  organization_type: string | null;
  title: string | null;
  city: string | null;
  created_at: string | null;
}

export const checkAdmin = () =>
  api
    .get<{ is_admin: boolean; role: string }>("/admin/check")
    .then((r) => r.data);

export const listAccessKeys = () =>
  api.get<AccessKeyItem[]>("/admin/access-keys").then((r) => r.data);

export const generateAccessKey = (label: string, notifyEmail?: string) =>
  api
    .post<AccessKeyCreated>("/admin/access-keys", {
      label,
      notify_email: notifyEmail || null,
    })
    .then((r) => r.data);

export const revokeAccessKey = (id: string) =>
  api.delete(`/admin/access-keys/${id}`).then((r) => r.data);

export const listOrgAccounts = () =>
  api.get<OrgAccount[]>("/admin/org-accounts").then((r) => r.data);

/* ------------------------------------------------------------------ */
/*  User Role Management (master_admin only)                           */
/* ------------------------------------------------------------------ */

export interface UserRoleItem {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
  assigned_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const listUserRoles = () =>
  api.get<UserRoleItem[]>("/admin/users").then((r) => r.data);

export const createUserRole = (data: {
  user_id: string;
  email?: string;
  role: "admin" | "user";
}) => api.post<UserRoleItem>("/admin/users", data).then((r) => r.data);

export const updateUserRole = (userId: string, role: "admin" | "user") =>
  api.put<UserRoleItem>(`/admin/users/${userId}`, { role }).then((r) => r.data);

export const deleteUserRole = (userId: string) =>
  api.delete(`/admin/users/${userId}`).then((r) => r.data);

/* ------------------------------------------------------------------ */
/*  Admin Job Management                                               */
/* ------------------------------------------------------------------ */

export interface AdminJob {
  job_id: string;
  name: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  user_id: string | null;
  user_email: string;
  created_at: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
}

export interface AdminJobsResponse {
  jobs: AdminJob[];
  total: number;
  page: number;
  per_page: number;
}

export interface AdminJobFilters {
  status?: string;
  user_id?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  per_page?: number;
}

export const getAdminJobs = (filters?: AdminJobFilters) =>
  api
    .get<AdminJobsResponse>("/admin/jobs", { params: filters })
    .then((r) => r.data);

export const adminCancelJob = (jobId: string) =>
  api.delete(`/admin/jobs/${jobId}`).then((r) => r.data);

export const adminForceErrorJob = (jobId: string) =>
  api.post(`/admin/jobs/${jobId}/force-error`).then((r) => r.data);
