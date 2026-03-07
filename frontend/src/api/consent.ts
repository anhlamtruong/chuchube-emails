import api from "./instance";

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
