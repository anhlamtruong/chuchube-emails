import api from "./instance";

// --- Clipboard Parse ---
export interface ClipboardPreviewRow {
  name: string;
  email: string;
  title: string;
  company: string;
  location: string;
  notes: string;
}

export interface ClipboardParseResult {
  preview: ClipboardPreviewRow[];
  detected_columns: Record<string, string>;
  unmapped_columns: string[];
  total_rows: number;
}

export const parseClipboard = (text: string) =>
  api
    .post<ClipboardParseResult>("/import-export/parse-clipboard", { text })
    .then((r) => r.data);

export const commitClipboard = (data: {
  rows: ClipboardPreviewRow[];
  target: "recruiters" | "referrals" | "both";
  campaign_defaults?: { sender_email: string; template_file: string };
}) => api.post("/import-export/commit-clipboard", data).then((r) => r.data);
