import api from "./instance";

// --- Import/Export ---
export const importCampaigns = (file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post("/import-export/import-campaigns", fd).then((r) => r.data);
};

export const importRecruiters = (file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post("/import-export/import-recruiters", fd).then((r) => r.data);
};

export const importRecruitersBulk = (files: File[]) => {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  return api
    .post("/import-export/import-recruiters-bulk", fd)
    .then((r) => r.data);
};

export const exportCampaigns = () =>
  api
    .get("/import-export/export-campaigns", { responseType: "blob" })
    .then((r) => {
      const url = window.URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "campaigns_export.xlsx";
      a.click();
      window.URL.revokeObjectURL(url);
    });
