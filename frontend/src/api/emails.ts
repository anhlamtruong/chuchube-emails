import api from "./instance";
import { getSSEToken } from "./sseToken";

/**
 * Extract a human-readable message from an axios error response.
 * Returns the conflict detail for HTTP 409, or a generic fallback.
 */
export function extractApiError(err: unknown, fallback: string): string {
  if (
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof (err as Record<string, unknown>).response === "object"
  ) {
    const resp = (
      err as { response: { status?: number; data?: { detail?: string } } }
    ).response;
    if (resp?.status === 409 && resp.data?.detail) {
      return resp.data.detail;
    }
    if (resp?.data?.detail) {
      return resp.data.detail;
    }
  }
  return fallback;
}

/**
 * Returns true if the error is an HTTP 409 Conflict.
 */
export function isConflictError(err: unknown): boolean {
  if (typeof err === "object" && err !== null && "response" in err) {
    const resp = (err as { response: { status?: number } }).response;
    return resp?.status === 409;
  }
  return false;
}

// --- Emails ---
export const sendEmails = (rowIds: string[]) =>
  api
    .post<{ job_id: string }>("/emails/send", { row_ids: rowIds })
    .then((r) => r.data);

export const getJobStatus = (jobId: string) =>
  api
    .get<{
      job_id: string;
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
  scheduled_at: string | null;
}

export interface FinishedJob extends ScheduledJob {
  completed_at: string | null;
}

export interface JobEmail {
  id: string;
  recipient_name: string;
  recipient_email: string;
  company: string;
  position: string;
  sender_email: string;
  template_file: string;
  sent_status: string;
  sent_at: string | null;
}

export interface JobDetail {
  job_id: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  errors: string[];
  created_at: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  parent_job_id: string | null;
  emails: JobEmail[];
  owner_email?: string | null;
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

export const getScheduledJobs = (opts?: { finishedLimit?: number }) =>
  api
    .get<ScheduledJobsResponse>("/emails/scheduled-jobs", {
      params:
        opts?.finishedLimit !== undefined
          ? { finished_limit: opts.finishedLimit }
          : undefined,
    })
    .then((r) => r.data);

export const cancelScheduledJob = (jobId: string) =>
  api.delete(`/emails/scheduled-jobs/${jobId}`).then((r) => r.data);

export const getJobDetail = (jobId: string) =>
  api.get<JobDetail>(`/emails/jobs/${jobId}/detail`).then((r) => r.data);

export const rerunJob = (jobId: string) =>
  api
    .post<{
      job_id: string;
      status: string;
      total: number;
      parent_job_id: string;
    }>(`/emails/jobs/${jobId}/rerun`)
    .then((r) => r.data);

export const rescheduleJob = (
  jobId: string,
  runAt: string,
  timezone: string = "UTC",
) =>
  api
    .post<{
      job_id: string;
      status: string;
      run_at: string;
      total: number;
      parent_job_id: string;
    }>(`/emails/jobs/${jobId}/reschedule`, {
      run_at: runAt,
      timezone,
    })
    .then((r) => r.data);

export const cloneJob = (jobId: string) =>
  api
    .post<{
      job_id: string;
      status: string;
      total: number;
      parent_job_id: string;
    }>(`/emails/jobs/${jobId}/clone`)
    .then((r) => r.data);

// --- OOO Re-send suggestions ---
export interface OooResendable {
  email_column_id: string;
  recipient_name: string;
  recipient_email: string;
  company: string;
  sender_email: string;
  template_file: string;
  sent_at: string | null;
  ooo_return_date: string | null;
  contact_type: "recruiter" | "referral";
  contact_id: string;
}

export const getOooResendable = () =>
  api.get<OooResendable[]>("/emails/ooo-resendable").then((r) => r.data);

// --- SSE Scan Stream ---
export interface ScanEmailEvent {
  subject: string;
  from_addr: string;
  classification: string;
  method: string;
  account: string;
}

/**
 * Subscribe to the per-email SSE stream during a running scan.
 * Returns an EventSource instance. Caller should attach onmessage / onerror.
 * Uses a short-lived SSE token (EventSource cannot set Authorization headers).
 */
export async function subscribeScanStream(): Promise<EventSource> {
  const token = await getSSEToken();
  return new EventSource(
    `/api/bounces/scan/stream?token=${encodeURIComponent(token)}`,
  );
}
