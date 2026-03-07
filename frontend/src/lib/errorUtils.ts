/**
 * Centralized error handling utilities.
 *
 * Provides a single source of truth for extracting API error messages,
 * displaying toasts, and logging errors to the console.
 */
import { toast } from "sonner";
import type { AxiosError } from "axios";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Shape returned by the FastAPI backend in error responses. */
export interface ApiErrorDetail {
  detail: string | Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Extract a human-readable message from an unknown caught value.
 *
 * Handles:
 *  - Axios errors with `response.data.detail` (string or object)
 *  - Native `Error` instances
 *  - Plain strings
 *  - Falls back to `fallback`
 */
export function getErrorMessage(
  err: unknown,
  fallback = "Something went wrong",
): string {
  // Axios-shaped error
  if (typeof err === "object" && err !== null && "response" in err) {
    const axErr = err as AxiosError<ApiErrorDetail>;
    const detail = axErr.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (typeof detail === "object" && detail !== null && "message" in detail) {
      return String((detail as Record<string, unknown>).message);
    }
  }

  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;

  return fallback;
}

/**
 * Handle an API (or general async) error:
 *  1. Extract the best message
 *  2. Show a toast
 *  3. Log to console for debugging
 *
 * Use this in every `catch` block instead of ad-hoc toast.error() calls.
 */
export function handleApiError(err: unknown, fallbackMessage: string): void {
  const message = getErrorMessage(err, fallbackMessage);
  toast.error(message);

  // Always log — makes production debugging feasible
  console.error(`[API Error] ${fallbackMessage}:`, err);
}
