import { useEffect, useState } from "react";
import { getSenders, getTemplates } from "@/api/client";
import type { Template, SenderInfo } from "@/api/client";

interface Props {
  senderEmail: string;
  templateFile: string;
  onSenderChange: (v: string) => void;
  onTemplateChange: (v: string) => void;
}

export default function SenderTemplatePicker({
  senderEmail,
  templateFile,
  onSenderChange,
  onTemplateChange,
}: Props) {
  const [senders, setSenders] = useState<SenderInfo[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    getSenders().then((r) => setSenders(r.senders));
    getTemplates().then(setTemplates);
  }, []);

  const providerBadge = (provider: string) => {
    if (provider === "resend")
      return (
        <span className="ml-1.5 text-[10px] font-medium bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
          Resend
        </span>
      );
    return (
      <span className="ml-1.5 text-[10px] font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
        SMTP
      </span>
    );
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Sender Email
        </label>
        <select
          value={senderEmail}
          onChange={(e) => onSenderChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select sender…</option>
          {senders.map((s) => (
            <option key={s.email} value={s.email}>
              {s.display_name ? `${s.display_name} <${s.email}>` : s.email}
              {s.is_default ? " ★" : ""}
            </option>
          ))}
        </select>
        {senderEmail && senders.length > 0 && (() => {
          const selected = senders.find((s) => s.email === senderEmail);
          if (!selected) return null;
          return (
            <div className="mt-1 flex items-center">
              {providerBadge(selected.provider)}
              {selected.is_default && (
                <span className="ml-1 text-[10px] font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                  Default
                </span>
              )}
            </div>
          );
        })()}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Template
        </label>
        <select
          value={templateFile}
          onChange={(e) => onTemplateChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
