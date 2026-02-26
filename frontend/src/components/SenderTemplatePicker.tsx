import { useEffect, useState } from "react";
import { getSenders, getTemplates } from "@/api/client";
import type { Template } from "@/api/client";

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
  const [senders, setSenders] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    getSenders().then((r) => setSenders(r.senders));
    getTemplates().then(setTemplates);
  }, []);

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
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
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
