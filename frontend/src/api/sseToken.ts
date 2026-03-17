import api from "./instance";

/**
 * Fetch a short-lived SSE token from the backend.
 *
 * SSE endpoints (EventSource) cannot set Authorization headers, so we
 * obtain a scoped HMAC token (60s TTL) and pass it as a query param.
 * This avoids leaking the main Clerk JWT in URLs / server logs.
 */
export const getSSEToken = (): Promise<string> =>
  api.post<{ token: string }>("/auth/sse-token").then((r) => r.data.token);
