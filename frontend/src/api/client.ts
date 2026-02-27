import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

/**
 * Clerk session token injection.
 *
 * We store a reference to the Clerk `getToken` function that is set once
 * from a React component (see App.tsx useEffect).  This avoids importing
 * React hooks inside a plain TS module.
 */
let _getToken: (() => Promise<string | null>) | null = null;

export function setClerkTokenGetter(fn: () => Promise<string | null>) {
  _getToken = fn;
}

// Inject Clerk bearer token + access key on every request
api.interceptors.request.use(async (config) => {
  if (_getToken) {
    const token = await _getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  // Include access key if stored
  const accessKey = localStorage.getItem("access_key");
  if (accessKey) {
    config.headers["X-Access-Key"] = accessKey;
  }
  return config;
});

// Handle 401 + 403 (access key invalid)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Clerk handles the redirect; just reject so callers can show a toast
    }
    if (
      err.response?.status === 403 &&
      typeof err.response?.data?.detail === "string" &&
      err.response.data.detail.toLowerCase().includes("access key")
    ) {
      // Invalid access key — clear it and reload to show gate
      localStorage.removeItem("access_key");
      window.location.href = "/";
    }
    return Promise.reject(err);
  },
);

export default api;

// --- Dashboard ---
export const getDashboard = () => api.get("/dashboard").then((r) => r.data);

// --- Paginated response ---
export interface Paginated<T> {
  items: T[];
  total: number;
}

// --- Recruiters ---
export interface Recruiter {
  id: string;
  name: string;
  email: string;
  company: string;
  title: string;
  location: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export const getRecruiters = (params?: Record<string, string | number>) =>
  api.get<Paginated<Recruiter>>("/recruiters/", { params }).then((r) => r.data);

export const getRecruiterCount = () =>
  api.get<{ count: number }>("/recruiters/count").then((r) => r.data);

export const createRecruiter = (data: Partial<Recruiter>) =>
  api.post<Recruiter>("/recruiters/", data).then((r) => r.data);

export const updateRecruiter = (id: string, data: Partial<Recruiter>) =>
  api.put<Recruiter>(`/recruiters/${id}`, data).then((r) => r.data);

export const deleteRecruiter = (id: string) =>
  api.delete(`/recruiters/${id}`).then((r) => r.data);

// --- Referrals ---
export interface Referral {
  id: string;
  name: string;
  email: string;
  company: string;
  title: string;
  location: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export const getReferrals = (params?: Record<string, string | number>) =>
  api.get<Paginated<Referral>>("/referrals/", { params }).then((r) => r.data);

export const getReferralCount = () =>
  api.get<{ count: number }>("/referrals/count").then((r) => r.data);

export const createReferral = (data: Partial<Referral>) =>
  api.post<Referral>("/referrals/", data).then((r) => r.data);

export const updateReferral = (id: string, data: Partial<Referral>) =>
  api.put<Referral>(`/referrals/${id}`, data).then((r) => r.data);

export const deleteReferral = (id: string) =>
  api.delete(`/referrals/${id}`).then((r) => r.data);

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

// --- Emails ---
export const sendEmails = (rowIds: string[]) =>
  api
    .post<{ job_id: string }>("/emails/send", { row_ids: rowIds })
    .then((r) => r.data);

export const getJobStatus = (jobId: string) =>
  api
    .get<{
      job_id: string;
      celery_task_id: string | null;
      status: string;
      total: number;
      sent: number;
      failed: number;
      errors: string[];
      created_at: string | null;
      completed_at: string | null;
    }>(`/emails/status/${jobId}`)
    .then((r) => r.data);

export interface SenderInfo {
  email: string;
  display_name: string;
  provider: string;
  is_default: boolean;
}

export const getSenders = () =>
  api.get<{ senders: SenderInfo[] }>("/emails/senders").then((r) => r.data);

// --- Sender Accounts ---
export interface SenderAccount {
  id: string;
  email: string;
  display_name: string;
  provider: string;
  smtp_host: string | null;
  smtp_port: number | null;
  is_default: boolean;
  organization_name: string | null;
  organization_type: string | null;
  title: string | null;
  city: string | null;
  created_at: string;
  updated_at: string;
}

export interface SenderAccountCreate {
  email: string;
  display_name: string;
  provider: string;
  smtp_host?: string | null;
  smtp_port?: number | null;
  credential: string;
  is_default?: boolean;
  organization_name?: string | null;
  organization_type?: string | null;
  title?: string | null;
  city?: string | null;
}

export const getSenderAccounts = () =>
  api.get<SenderAccount[]>("/sender-accounts/").then((r) => r.data);

export const createSenderAccount = (data: SenderAccountCreate) =>
  api.post<SenderAccount>("/sender-accounts/", data).then((r) => r.data);

export const updateSenderAccount = (
  id: string,
  data: Partial<SenderAccountCreate>,
) => api.put<SenderAccount>(`/sender-accounts/${id}`, data).then((r) => r.data);

export const deleteSenderAccount = (id: string) =>
  api.delete(`/sender-accounts/${id}`).then((r) => r.data);

export const testSenderAccount = (id: string) =>
  api
    .post<{ status: string; detail: string }>(`/sender-accounts/${id}/test`)
    .then((r) => r.data);

export const testSenderCredential = (data: SenderAccountCreate) =>
  api
    .post<{
      status: string;
      detail: string;
    }>("/sender-accounts/test-credential", data)
    .then((r) => r.data);

// --- Scheduling ---
export interface ScheduledJob {
  job_id: string;
  name: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  created_at: string | null;
}

export interface FinishedJob extends ScheduledJob {
  completed_at: string | null;
}

export interface ScheduledJobsResponse {
  jobs: ScheduledJob[];
  finished: FinishedJob[];
}

export const scheduleEmails = (
  rowIds: string[],
  runAt: string,
  timezone: string = "UTC",
) =>
  api
    .post<{ job_id: string; status: string; run_at: string }>(
      "/emails/schedule",
      {
        row_ids: rowIds,
        run_at: runAt,
        timezone,
      },
    )
    .then((r) => r.data);

export const scheduleRecurring = (
  rowIds: string[],
  cron: Record<string, string | number>,
  timezone: string = "UTC",
) =>
  api
    .post<{
      job_id: string;
      status: string;
      cron: Record<string, string | number>;
    }>("/emails/schedule/recurring", { row_ids: rowIds, cron, timezone })
    .then((r) => r.data);

export const getScheduledJobs = () =>
  api.get<ScheduledJobsResponse>("/emails/scheduled-jobs").then((r) => r.data);

export const cancelScheduledJob = (jobId: string) =>
  api.delete(`/emails/scheduled-jobs/${jobId}`).then((r) => r.data);

// --- Import/Export ---
export const importCampaigns = (file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post("/import-export/import-campaigns", fd).then((r) => r.data);
};

export const importRecruiters = (file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post("/import-export/import-recruiters", fd).then((r) => r.data);
};

export const importRecruitersBulk = (files: File[]) => {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  return api
    .post("/import-export/import-recruiters-bulk", fd)
    .then((r) => r.data);
};

export const exportCampaigns = () =>
  api
    .get("/import-export/export-campaigns", { responseType: "blob" })
    .then((r) => {
      const url = window.URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "campaigns_export.xlsx";
      a.click();
      window.URL.revokeObjectURL(url);
    });

// --- Clipboard Parse ---
export interface ClipboardPreviewRow {
  name: string;
  email: string;
  title: string;
  company: string;
  location: string;
  notes: string;
}

export interface ClipboardParseResult {
  preview: ClipboardPreviewRow[];
  detected_columns: Record<string, string>;
  unmapped_columns: string[];
  total_rows: number;
}

export const parseClipboard = (text: string) =>
  api
    .post<ClipboardParseResult>("/import-export/parse-clipboard", { text })
    .then((r) => r.data);

export const commitClipboard = (data: {
  rows: ClipboardPreviewRow[];
  target: "recruiters" | "referrals" | "both";
  campaign_defaults?: { sender_email: string; template_file: string };
}) => api.post("/import-export/commit-clipboard", data).then((r) => r.data);

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
  rows: ClipboardPreviewRow[];
  sender_email: string;
  template_file: string;
  position?: string;
  custom_field_overrides?: Record<string, string>;
}) => api.post("/campaigns/bulk-paste", data).then((r) => r.data);

// --- Documents ---
export interface DocumentItem {
  id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  scope: string;
  scope_ref: string | null;
  user_id: string | null;
  created_at: string;
}

export const getDocuments = (params?: { scope?: string; scope_ref?: string }) =>
  api.get<DocumentItem[]>("/documents/", { params }).then((r) => r.data);

export const uploadDocument = (
  file: File,
  scope: string,
  scopeRef: string = "",
) => {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("scope", scope);
  fd.append("scope_ref", scopeRef);
  return api.post<DocumentItem>("/documents/upload", fd).then((r) => r.data);
};

export const uploadDocuments = (
  files: File[],
  scope: string,
  scopeRef: string = "",
) => {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  fd.append("scope", scope);
  fd.append("scope_ref", scopeRef);
  return api
    .post<DocumentItem[]>("/documents/upload-multiple", fd)
    .then((r) => r.data);
};

export const deleteDocument = (id: string) =>
  api.delete(`/documents/${id}`).then((r) => r.data);

export const downloadDocument = (id: string, filename: string) =>
  api.get(`/documents/${id}/download`, { responseType: "blob" }).then((r) => {
    const url = window.URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  });

// --- Settings ---
export interface SettingItem {
  key: string;
  value: string;
  description: string;
}

export const getSettings = () =>
  api.get<SettingItem[]>("/settings/").then((r) => r.data);

export const updateSetting = (key: string, value: string) =>
  api.put<SettingItem>(`/settings/${key}`, { value }).then((r) => r.data);

export const bulkUpdateSettings = (settings: Record<string, string>) =>
  api.put<SettingItem[]>("/settings/", { settings }).then((r) => r.data);

export const getCampaignDefaults = () =>
  api.get<SettingItem[]>("/settings/").then((r) => {
    const items = r.data;
    const lookup: Record<string, string> = {};
    items.forEach((s) => {
      lookup[s.key] = s.value;
    });
    return {
      position: lookup["default_position"] || "",
      framework: lookup["default_framework"] || "passion",
      my_strength: lookup["default_my_strength"] || "",
      audience_value: lookup["default_audience_value"] || "",
    };
  });

/* ------------------------------------------------------------------ */
/*  Consent / Legal                                                    */
/* ------------------------------------------------------------------ */

export interface ConsentItem {
  consent_type: string;
  required_version: string;
  accepted: boolean;
  accepted_at: string | null;
}

export interface ConsentStatus {
  consents: ConsentItem[];
  all_accepted: boolean;
}

export interface ConsentHistoryItem {
  consent_type: string;
  version: string;
  accepted_at: string | null;
  ip_address: string | null;
}

export const getConsentStatus = () =>
  api.get<ConsentStatus>("/consent/status").then((r) => r.data);

export const acceptConsent = (consent_type: string, version: string) =>
  api
    .post<{ status: string; consent_type: string }>("/consent/accept", {
      consent_type,
      version,
    })
    .then((r) => r.data);

export const acceptAllConsents = () =>
  api
    .post<{ status: string; accepted: string[] }>("/consent/accept-all")
    .then((r) => r.data);

export const getConsentHistory = () =>
  api
    .get<{ history: ConsentHistoryItem[] }>("/consent/history")
    .then((r) => r.data);

/* ------------------------------------------------------------------ */
/*  Access Key                                                         */
/* ------------------------------------------------------------------ */

export const validateAccessKey = (key: string) =>
  api
    .post<{ valid: boolean; label: string }>("/auth/validate-access-key", {
      key,
    })
    .then((r) => r.data);

/* ------------------------------------------------------------------ */
/*  Admin                                                              */
/* ------------------------------------------------------------------ */

export interface AccessKeyItem {
  id: string;
  key: string;
  label: string;
  created_at: string | null;
  used_by_user_id: string | null;
  used_at: string | null;
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
  api.get<{ is_admin: boolean }>("/admin/check").then((r) => r.data);

export const listAccessKeys = () =>
  api.get<AccessKeyItem[]>("/admin/access-keys").then((r) => r.data);

export const generateAccessKey = (label: string) =>
  api
    .post<AccessKeyItem>("/admin/access-keys", { label })
    .then((r) => r.data);

export const revokeAccessKey = (id: string) =>
  api.delete(`/admin/access-keys/${id}`).then((r) => r.data);

export const listOrgAccounts = () =>
  api.get<OrgAccount[]>("/admin/org-accounts").then((r) => r.data);
