import { useEffect, useState } from "react";
import { getSenders, getTemplates } from "@/api/client";
import type { Template, SenderInfo } from "@/api/client";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

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

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label>Sender Email</Label>
        <Select
          value={senderEmail}
          onChange={(e) => onSenderChange(e.target.value)}
        >
          <option value="">Select sender…</option>
          {senders.map((s) => (
            <option key={s.email} value={s.email}>
              {s.display_name ? `${s.display_name} <${s.email}>` : s.email}
              {s.is_default ? " ★" : ""}
            </option>
          ))}
        </Select>
        {senderEmail &&
          senders.length > 0 &&
          (() => {
            const selected = senders.find((s) => s.email === senderEmail);
            if (!selected) return null;
            return (
              <div className="mt-1 flex items-center gap-1">
                <Badge
                  variant={selected.provider === "resend" ? "secondary" : "default"}
                  className="text-[10px] px-1.5 py-0"
                >
                  {selected.provider === "resend" ? "Resend" : "SMTP"}
                </Badge>
                {selected.is_default && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 text-green-700 border-green-300"
                  >
                    Default
                  </Badge>
                )}
              </div>
            );
          })()}
      </div>
      <div className="space-y-1.5">
        <Label>Template</Label>
        <Select
          value={templateFile}
          onChange={(e) => onTemplateChange(e.target.value)}
        >
          <option value="">Select template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
