import api from "./instance";

/* ------------------------------------------------------------------ */
/*  Access Key                                                         */
/* ------------------------------------------------------------------ */

export const validateAccessKey = (key: string) =>
  api
    .post<{ valid: boolean; label: string }>("/auth/validate-access-key", {
      key,
    })
    .then((r) => r.data);
