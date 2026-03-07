import api from "./instance";

/* ------------------------------------------------------------------ */
/*  Bounce Detection                                                   */
/* ------------------------------------------------------------------ */

export interface BounceLogItem {
  id: string;
  sender_email: string;
  recipient_email: string;
  bounce_type: string;
  classification: string;
  raw_subject: string;
  raw_snippet: string;
  error_code: string | null;
  detail: Record<string, unknown> | null;
  action_taken: string;
  created_at: string | null;
}

export interface BounceStats {
  total_bounces: number;
  hard_bounces: number;
  soft_bounces: number;
  ooo_replies: number;
  last_check: string | null;
  bounced_contacts: number;
  risky_contacts: number;
  ooo_contacts: number;
  total_contacts: number;
  valid_contacts: number;
  enabled: boolean;
}

export interface BounceScanResult {
  accounts: number;
  checked: number;
  bounces: number;
  ooo: number;
  errors: string[];
}

export interface BounceScanProgress {
  status: "idle" | "running" | "done" | "error";
  current_account: string;
  total_accounts: number;
  accounts_done: number;
  checked: number;
  bounces: number;
  ooo: number;
  errors: string[];
  started_at: string | null;
  finished_at: string | null;
}

export interface OllamaStatus {
  available: boolean;
  configured_model: string;
  local_models: string[];
  model_ready: boolean;
  bounce_check_enabled: boolean;
}

export interface OllamaTestResultItem {
  test_label: string;
  input_preview: string;
  classification: string;
  time_seconds: number;
}

export interface OllamaTestResult {
  model: string;
  healthy: boolean;
  consecutive_failures: number;
  results: OllamaTestResultItem[];
  total_time_seconds: number;
}

export const getBounceStats = () =>
  api.get<BounceStats>("/bounces/stats").then((r) => r.data);

export const getBounceLogs = (params?: {
  limit?: number;
  bounce_type?: string;
}) => api.get<BounceLogItem[]>("/bounces/logs", { params }).then((r) => r.data);

export const triggerBounceScan = () =>
  api.post<{ status: string }>("/bounces/scan").then((r) => r.data);

export const getBounceScanStatus = () =>
  api.get<BounceScanProgress>("/bounces/scan/status").then((r) => r.data);

export const getOllamaStatus = () =>
  api.get<OllamaStatus>("/bounces/ollama-status").then((r) => r.data);

export const pullOllamaModel = () =>
  api
    .post<{ status: string; model: string }>("/bounces/ollama-pull")
    .then((r) => r.data);

export const testOllamaClassify = () =>
  api
    .post<OllamaTestResult>("/bounces/ollama-test", {}, { timeout: 600_000 })
    .then((r) => r.data);

export const resetContactStatus = (email: string) =>
  api
    .post<{
      status: string;
      email: string;
    }>(`/bounces/reset-status/${encodeURIComponent(email)}`)
    .then((r) => r.data);

export const toggleBounceScan = () =>
  api.post<{ enabled: boolean }>("/bounces/toggle").then((r) => r.data);

export const getBounceScanEnabled = () =>
  api.get<{ enabled: boolean }>("/bounces/toggle").then((r) => r.data);

/* ------------------------------------------------------------------ */
/*  Scan Config                                                        */
/* ------------------------------------------------------------------ */

export interface BounceScanConfig {
  since_days: number;
  max_messages: number;
}

export const getBounceScanConfig = () =>
  api.get<BounceScanConfig>("/bounces/scan-config").then((r) => r.data);

export const updateBounceScanConfig = (config: BounceScanConfig) =>
  api
    .put<BounceScanConfig>("/bounces/scan-config", null, {
      params: config,
    })
    .then((r) => r.data);

/* ------------------------------------------------------------------ */
/*  OOO Management                                                     */
/* ------------------------------------------------------------------ */

export interface OooContact {
  id: string;
  type: "recruiter" | "referral";
  name: string;
  email: string;
  company: string;
  ooo_date: string | null;
  ooo_message: string;
  ooo_return_date: string | null;
  email_status: string;
}

export const getOooContacts = () =>
  api.get<OooContact[]>("/bounces/ooo-contacts").then((r) => r.data);

export const clearOooContacts = (contactIds: string[]) =>
  api
    .post<{ cleared: number }>("/bounces/ooo-clear", {
      contact_ids: contactIds,
    })
    .then((r) => r.data);

export const clearAllOooContacts = () =>
  api
    .post<{ cleared: number }>("/bounces/ooo-clear", {
      clear_all: true,
    })
    .then((r) => r.data);

export const expireOooContacts = () =>
  api.post<{ expired: number }>("/bounces/ooo-expire").then((r) => r.data);
