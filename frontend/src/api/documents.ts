import api from "./instance";

// --- Documents ---
export interface DocumentItem {
  id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  scope: string;
  scope_ref: string | null;
  user_id: string | null;
  created_at: string;
}

export const getDocuments = (params?: { scope?: string; scope_ref?: string }) =>
  api.get<DocumentItem[]>("/documents/", { params }).then((r) => r.data);

export const uploadDocument = (
  file: File,
  scope: string,
  scopeRef: string = "",
) => {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("scope", scope);
  fd.append("scope_ref", scopeRef);
  return api.post<DocumentItem>("/documents/upload", fd).then((r) => r.data);
};

export const uploadDocuments = (
  files: File[],
  scope: string,
  scopeRef: string = "",
) => {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  fd.append("scope", scope);
  fd.append("scope_ref", scopeRef);
  return api
    .post<DocumentItem[]>("/documents/upload-multiple", fd)
    .then((r) => r.data);
};

export const deleteDocument = (id: string) =>
  api.delete(`/documents/${id}`).then((r) => r.data);

export const downloadDocument = (id: string, filename: string) =>
  api.get(`/documents/${id}/download`, { responseType: "blob" }).then((r) => {
    const url = window.URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  });
