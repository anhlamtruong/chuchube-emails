import axios from "axios";
import { toast } from "sonner";
import { getAccessKey, clearAccessKey } from "../lib/accessKeyStore";

const api = axios.create({
  baseURL: "/api",
  timeout: 30_000, // 30 s — prevents requests from hanging indefinitely
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

export function getClerkToken(): Promise<string | null> {
  return _getToken ? _getToken() : Promise.resolve(null);
}

// Inject Clerk bearer token + access key on every request
api.interceptors.request.use(async (config) => {
  if (_getToken) {
    try {
      const token = await _getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.error("[Auth] Failed to retrieve Clerk token:", err);
    }
  }
  // Include access key if stored
  const accessKey = getAccessKey();
  if (accessKey) {
    config.headers["X-Access-Key"] = accessKey;
  }
  return config;
});

// Handle 401 + 403 (access key invalid) + global error notifications
api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Network error (no response at all)
    if (!err.response) {
      toast.error("Network error — please check your connection");
      console.error("[API] Network error:", err);
      return Promise.reject(err);
    }

    const status = err.response.status;

    if (status === 401) {
      // Clerk handles the redirect; just reject so callers can show a toast
    } else if (
      status === 403 &&
      typeof err.response?.data?.detail === "string" &&
      err.response.data.detail.toLowerCase().includes("access key")
    ) {
      // Invalid access key — clear it and reload to show gate
      clearAccessKey();
      window.location.href = "/";
    } else if (status >= 500) {
      // Log only — individual catch blocks show context-specific toasts
      console.error(
        `[API] Server ${status} on ${err.config?.url}:`,
        err.response?.data,
      );
    }

    return Promise.reject(err);
  },
);

export default api;
