import { useEffect, useRef, useCallback, useState } from "react";
import { useAuth } from "@clerk/clerk-react";

export interface JobUpdateEvent {
  job_id: string;
  status: string;
  sent: number;
  failed: number;
  total: number;
  completed_at?: string | null;
}

export interface EmailUpdateEvent {
  job_id: string;
  row_id: string;
  recipient_email: string;
  recipient_name: string;
  company: string;
  sent_status: string;
  sent_at: string | null;
}

interface UseJobSSEOptions {
  /** Specific job ID → per-job stream. Omit → global stream. */
  jobId?: string;
  /** Called on job_update / job_started events */
  onJobUpdate?: (data: JobUpdateEvent) => void;
  /** Called on email_update events (per-job stream only) */
  onEmailUpdate?: (data: EmailUpdateEvent) => void;
  /** Called on job_finished events */
  onJobFinished?: (data: JobUpdateEvent) => void;
  /** Whether the hook is enabled (default true) */
  enabled?: boolean;
}

/**
 * Hook that connects to the job SSE stream.
 * - If `jobId` is provided, connects to `/api/emails/jobs/{jobId}/stream`
 * - If omitted, connects to `/api/emails/jobs/stream` (global)
 *
 * Uses Clerk auth token as query param (EventSource can't set headers).
 * Auto-reconnects with exponential backoff.
 */
export function useJobSSE({
  jobId,
  onJobUpdate,
  onEmailUpdate,
  onJobFinished,
  enabled = true,
}: UseJobSSEOptions) {
  const { getToken } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const mountedRef = useRef(true);

  // Store latest callbacks in refs to avoid reconnecting on every render
  const cbRefs = useRef({ onJobUpdate, onEmailUpdate, onJobFinished });
  cbRefs.current = { onJobUpdate, onEmailUpdate, onJobFinished };

  const connect = useCallback(async () => {
    if (!mountedRef.current || !enabled) return;

    try {
      const token = await getToken();
      if (!token || !mountedRef.current) return;

      const base = import.meta.env.VITE_API_URL ?? "";
      const path = jobId
        ? `${base}/api/emails/jobs/${jobId}/stream`
        : `${base}/api/emails/jobs/stream`;
      const url = `${path}?token=${encodeURIComponent(token)}`;

      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        if (!mountedRef.current) return;
        setIsConnected(true);
        retryRef.current = 0;
      };

      es.addEventListener("job_update", (e) => {
        try {
          cbRefs.current.onJobUpdate?.(JSON.parse(e.data));
        } catch (err) {
          console.error("[SSE] Failed to parse job_update:", err);
        }
      });
      es.addEventListener("job_started", (e) => {
        try {
          cbRefs.current.onJobUpdate?.(JSON.parse(e.data));
        } catch (err) {
          console.error("[SSE] Failed to parse job_started:", err);
        }
      });
      es.addEventListener("email_update", (e) => {
        try {
          cbRefs.current.onEmailUpdate?.(JSON.parse(e.data));
        } catch (err) {
          console.error("[SSE] Failed to parse email_update:", err);
        }
      });
      es.addEventListener("job_finished", (e) => {
        try {
          cbRefs.current.onJobFinished?.(JSON.parse(e.data));
        } catch (err) {
          console.error("[SSE] Failed to parse job_finished:", err);
        }
        // Server will close the stream; we don't need to reconnect
        es.close();
        setIsConnected(false);
      });

      es.onerror = () => {
        es.close();
        setIsConnected(false);
        if (!mountedRef.current) return;
        // Exponential backoff: 1s, 2s, 4s, max 10s
        const delay = Math.min(1000 * Math.pow(2, retryRef.current), 10_000);
        retryRef.current += 1;
        setTimeout(() => {
          if (mountedRef.current && enabled) connect();
        }, delay);
      };
    } catch {
      // Token fetch failed — retry after delay
      if (!mountedRef.current) return;
      const delay = Math.min(1000 * Math.pow(2, retryRef.current), 10_000);
      retryRef.current += 1;
      setTimeout(() => {
        if (mountedRef.current && enabled) connect();
      }, delay);
    }
  }, [getToken, jobId, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) connect();
    return () => {
      mountedRef.current = false;
      esRef.current?.close();
      esRef.current = null;
      setIsConnected(false);
    };
  }, [connect, enabled]);

  return { isConnected };
}
