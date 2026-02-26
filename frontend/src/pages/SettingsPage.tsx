import { useState, useEffect, useCallback } from "react";
import {
  getSettings,
  bulkUpdateSettings,
  type SettingItem,
} from "@/api/client";
import { toast } from "sonner";
import { Save, Settings, FlaskConical, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/api/client";

// Group settings for display
const GROUPS: { label: string; keys: string[] }[] = [
  {
    label: "Campaign Defaults",
    keys: [
      "default_position",
      "default_framework",
      "default_my_strength",
      "default_audience_value",
    ],
  },
  {
    label: "Personal Info",
    keys: ["your_name", "your_phone", "your_city_state"],
  },
  {
    label: "SMTP / Sending",
    keys: ["smtp_server", "smtp_port", "sleep_between_emails"],
  },
];

const FRIENDLY_LABELS: Record<string, string> = {
  default_position: "Default Position",
  default_framework: "Default Framework",
  default_my_strength: 'Default "My Strength"',
  default_audience_value: 'Default "Audience Value"',
  your_name: "Your Name",
  your_phone: "Your Phone Number",
  your_city_state: "Your City & State",
  smtp_server: "SMTP Server",
  smtp_port: "SMTP Port",
  sleep_between_emails: "Delay Between Emails (sec)",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSettings();
      setSettings(data);
      const v: Record<string, string> = {};
      data.forEach((s) => {
        v[s.key] = s.value;
      });
      setValues(v);
      setDirty(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleChange = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const changed: Record<string, string> = {};
      settings.forEach((s) => {
        if (values[s.key] !== s.value) {
          changed[s.key] = values[s.key];
        }
      });
      if (Object.keys(changed).length === 0) {
        toast("No changes to save");
        return;
      }
      await bulkUpdateSettings(changed);
      toast.success(`Saved ${Object.keys(changed).length} setting(s)`);
      await load();
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    setTesting(true);
    try {
      const res = await api.post("/settings/test-smtp");
      toast.success(res.data.detail || "SMTP connection OK");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "SMTP connection failed";
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-32" />
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="text-muted-foreground" size={28} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure defaults and SMTP
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <Badge variant="secondary">Unsaved changes</Badge>}
          <Button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <Save size={16} className="mr-2" />
            )}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Groups */}
      {GROUPS.map((group) => (
        <Card key={group.label}>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {group.keys.map((key) => {
              const setting = settings.find((s) => s.key === key);
              if (!setting) return null;
              const label = FRIENDLY_LABELS[key] || key;
              const isFramework = key === "default_framework";
              const isLongText =
                key === "default_my_strength" ||
                key === "default_audience_value";

              return (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={key}>{label}</Label>
                  <p className="text-xs text-muted-foreground">
                    {setting.description}
                  </p>
                  {isFramework ? (
                    <Select
                      id={key}
                      value={values[key] || ""}
                      onChange={(e) => handleChange(key, e.target.value)}
                    >
                      <option value="passion">passion</option>
                      <option value="known_for">known_for</option>
                      <option value="mission">mission</option>
                    </Select>
                  ) : isLongText ? (
                    <Textarea
                      id={key}
                      value={values[key] || ""}
                      onChange={(e) => handleChange(key, e.target.value)}
                      rows={2}
                    />
                  ) : (
                    <Input
                      id={key}
                      type="text"
                      value={values[key] || ""}
                      onChange={(e) => handleChange(key, e.target.value)}
                    />
                  )}
                </div>
              );
            })}

            {/* SMTP Test button inside SMTP group */}
            {group.label === "SMTP / Sending" && (
              <div className="pt-2 border-t">
                <Button
                  variant="outline"
                  onClick={handleTestSmtp}
                  disabled={testing}
                >
                  {testing ? (
                    <Loader2 size={16} className="mr-2 animate-spin" />
                  ) : (
                    <FlaskConical size={16} className="mr-2" />
                  )}
                  {testing ? "Testing..." : "Test SMTP Connection"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
