import api from "./instance";

// --- Dashboard ---
export const getDashboard = () => api.get("/dashboard").then((r) => r.data);
