import api from "./instance";

/* ------------------------------------------------------------------ */
/*  Email Threads                                                      */
/* ------------------------------------------------------------------ */

export interface ThreadMessage {
  id: string;
  direction: "outbound" | "inbound";
  message_id: string | null;
  from_email: string;
  to_email: string;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  sent_at: string;
}

export interface ThreadListItem {
  id: string;
  subject: string;
  status: string;
  reply_count: number;
  last_activity_at: string;
  first_sent_at: string;
  followup_due_at: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  company: string | null;
  latest_message_preview: string;
}

export interface ThreadDetail {
  id: string;
  subject: string;
  status: string;
  reply_count: number;
  last_activity_at: string;
  first_sent_at: string;
  followup_due_at: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  company: string | null;
  messages: ThreadMessage[];
}

export interface ThreadStats {
  total: number;
  awaiting_reply: number;
  replied: number;
  needs_followup: number;
  closed: number;
  overdue_followups: number;
}

/* ── API calls ─────────────────────────────────────────────────────── */

export const getThreads = (params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<ThreadListItem[]> =>
  api.get("/threads/", { params }).then((r) => r.data);

export const getThread = (threadId: string): Promise<ThreadDetail> =>
  api.get(`/threads/${threadId}`).then((r) => r.data);

export const getThreadsNeedingFollowup = (
  limit = 50,
): Promise<ThreadListItem[]> =>
  api.get("/threads/needs-followup", { params: { limit } }).then((r) => r.data);

export const getThreadStats = (): Promise<ThreadStats> =>
  api.get("/threads/stats").then((r) => r.data);

export const updateThreadStatus = (
  threadId: string,
  status: string,
): Promise<{ ok: boolean; status: string }> =>
  api.put(`/threads/${threadId}/status`, { status }).then((r) => r.data);

export const snoozeThread = (
  threadId: string,
  days: number,
): Promise<{ ok: boolean; followup_due_at: string }> =>
  api.post(`/threads/${threadId}/snooze`, { days }).then((r) => r.data);
