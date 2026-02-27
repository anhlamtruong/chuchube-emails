import { useState, useEffect, useCallback } from "react";
import {
  getSettings,
  bulkUpdateSettings,
  getSenderAccounts,
  createSenderAccount,
  updateSenderAccount,
  deleteSenderAccount,
  testSenderAccount,
  testSenderCredential,
  getCustomColumnDefinitions,
  createCustomColumnDefinition,
  updateCustomColumnDefinition,
  deleteCustomColumnDefinition,
  type SettingItem,
  type SenderAccount,
  type SenderAccountCreate,
  type CustomColumnDefinition,
} from "@/api/client";
import { toast } from "sonner";
import {
  Save,
  Settings,
  FlaskConical,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Mail,
  Star,
  CheckCircle2,
  XCircle,
  Columns3,
  Building2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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

  // --- Email Accounts state ---
  const [accounts, setAccounts] = useState<SenderAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SenderAccount | null>(
    null,
  );
  const [accountForm, setAccountForm] = useState<SenderAccountCreate>({
    email: "",
    display_name: "",
    provider: "smtp",
    smtp_host: "smtp.gmail.com",
    smtp_port: 465,
    credential: "",
    is_default: false,
    organization_name: null,
    organization_type: null,
    title: null,
    city: null,
  });
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountTesting, setAccountTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: "ok" | "error";
    detail: string;
  } | null>(null);

  // --- Custom Columns state ---
  const [customColumns, setCustomColumns] = useState<CustomColumnDefinition[]>(
    [],
  );
  const [customColumnsLoading, setCustomColumnsLoading] = useState(true);
  const [showAddColumnDialog, setShowAddColumnDialog] = useState(false);
  const [editingColumn, setEditingColumn] =
    useState<CustomColumnDefinition | null>(null);
  const [columnForm, setColumnForm] = useState({ name: "", default_value: "" });
  const [columnSaving, setColumnSaving] = useState(false);

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

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const data = await getSenderAccounts();
      setAccounts(data);
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const loadCustomColumns = useCallback(async () => {
    setCustomColumnsLoading(true);
    try {
      const data = await getCustomColumnDefinitions();
      setCustomColumns(data);
    } finally {
      setCustomColumnsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadAccounts();
    loadCustomColumns();
  }, [load, loadAccounts, loadCustomColumns]);

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

  // --- Email Account handlers ---
  const resetAccountForm = () => {
    setAccountForm({
      email: "",
      display_name: "",
      provider: "smtp",
      smtp_host: "smtp.gmail.com",
      smtp_port: 465,
      credential: "",
      is_default: false,
      organization_name: null,
      organization_type: null,
      title: null,
      city: null,
    });
    setEditingAccount(null);
    setTestResult(null);
  };

  const openAddDialog = () => {
    resetAccountForm();
    setShowAddDialog(true);
  };

  const openEditDialog = (account: SenderAccount) => {
    setEditingAccount(account);
    setAccountForm({
      email: account.email,
      display_name: account.display_name,
      provider: account.provider,
      smtp_host: account.smtp_host,
      smtp_port: account.smtp_port,
      credential: "", // don't pre-fill credential
      is_default: account.is_default,
      organization_name: account.organization_name,
      organization_type: account.organization_type,
      title: account.title,
      city: account.city,
    });
    setTestResult(null);
    setShowAddDialog(true);
  };

  const CONSUMER_DOMAINS = [
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk",
    "outlook.com", "hotmail.com", "live.com", "msn.com",
    "aol.com", "icloud.com", "me.com", "mac.com",
    "protonmail.com", "proton.me", "zoho.com",
    "yandex.com", "mail.com", "gmx.com", "gmx.net",
    "fastmail.com", "tutanota.com", "hey.com",
  ];

  const isOrgEmail = (email: string): boolean => {
    if (!email || !email.includes("@")) return false;
    const domain = email.split("@")[1]?.toLowerCase();
    return !!domain && !CONSUMER_DOMAINS.includes(domain);
  };

  const handleTestCredential = async () => {
    setAccountTesting(true);
    setTestResult(null);
    try {
      if (editingAccount && !accountForm.credential) {
        // Test existing account (credential already in Vault)
        const res = await testSenderAccount(editingAccount.id);
        setTestResult({ status: "ok", detail: res.detail });
        toast.success(res.detail);
      } else {
        // Test new credential before saving
        const res = await testSenderCredential(accountForm);
        setTestResult({ status: "ok", detail: res.detail });
        toast.success(res.detail);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Connection test failed";
      setTestResult({ status: "error", detail: msg });
      toast.error(msg);
    } finally {
      setAccountTesting(false);
    }
  };

  const handleSaveAccount = async () => {
    if (!accountForm.email || !accountForm.provider) {
      toast.error("Email and provider are required");
      return;
    }
    if (!editingAccount && !accountForm.credential) {
      toast.error("Credential (password or API key) is required");
      return;
    }

    setAccountSaving(true);
    try {
      if (editingAccount) {
        const updateData: Partial<SenderAccountCreate> = { ...accountForm };
        if (!updateData.credential) delete updateData.credential;
        await updateSenderAccount(editingAccount.id, updateData);
        toast.success("Account updated");
      } else {
        await createSenderAccount(accountForm);
        toast.success("Account created");
      }
      setShowAddDialog(false);
      resetAccountForm();
      await loadAccounts();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to save account";
      toast.error(msg);
    } finally {
      setAccountSaving(false);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm("Delete this sender account? This cannot be undone.")) return;
    try {
      await deleteSenderAccount(id);
      toast.success("Account deleted");
      await loadAccounts();
    } catch {
      toast.error("Failed to delete account");
    }
  };

  const handleProviderChange = (provider: string) => {
    setAccountForm((prev) => ({
      ...prev,
      provider,
      smtp_host: provider === "smtp" ? "smtp.gmail.com" : null,
      smtp_port: provider === "smtp" ? 465 : null,
      credential: "",
    }));
    setTestResult(null);
  };

  // --- Custom Column handlers ---
  const resetColumnForm = () => {
    setColumnForm({ name: "", default_value: "" });
    setEditingColumn(null);
  };

  const openAddColumnDialog = () => {
    resetColumnForm();
    setShowAddColumnDialog(true);
  };

  const openEditColumnDialog = (col: CustomColumnDefinition) => {
    setEditingColumn(col);
    setColumnForm({ name: col.name, default_value: col.default_value });
    setShowAddColumnDialog(true);
  };

  const handleSaveColumn = async () => {
    if (!columnForm.name.trim()) {
      toast.error("Column name is required");
      return;
    }
    setColumnSaving(true);
    try {
      if (editingColumn) {
        await updateCustomColumnDefinition(editingColumn.id, {
          name: columnForm.name.trim(),
          default_value: columnForm.default_value,
        });
        toast.success("Column updated");
      } else {
        await createCustomColumnDefinition({
          name: columnForm.name.trim(),
          default_value: columnForm.default_value,
        });
        toast.success("Column created");
      }
      setShowAddColumnDialog(false);
      resetColumnForm();
      await loadCustomColumns();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to save column";
      toast.error(msg);
    } finally {
      setColumnSaving(false);
    }
  };

  const handleDeleteColumn = async (id: string) => {
    if (
      !confirm("Delete this custom column definition? This cannot be undone.")
    )
      return;
    try {
      await deleteCustomColumnDefinition(id);
      toast.success("Column deleted");
      await loadCustomColumns();
    } catch {
      toast.error("Failed to delete column");
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

      {/* ============================================================= */}
      {/* Custom Columns Section                                         */}
      {/* ============================================================= */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Columns3 size={16} />
            Custom Columns
          </CardTitle>
          <Button size="sm" onClick={openAddColumnDialog}>
            <Plus size={14} className="mr-1" /> Add Column
          </Button>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3 text-xs text-indigo-800">
            Define custom columns with default values. When generating or
            pasting campaign rows, these columns will be auto-populated with
            their defaults (unless overridden). Custom columns also appear as{" "}
            <code className="font-mono bg-indigo-100 px-1 rounded">
              {"{column_name}"}
            </code>{" "}
            placeholders in your email templates.
          </div>

          {customColumnsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : customColumns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No custom columns defined yet. Add one to extend your campaign
              data.
            </p>
          ) : (
            <div className="space-y-2">
              {customColumns.map((col) => (
                <div
                  key={col.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted/50 transition"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{col.name}</span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-mono px-1.5 py-0"
                      >
                        {`{${col.name}}`}
                      </Badge>
                    </div>
                    {col.default_value ? (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Default:{" "}
                        <span className="font-medium">{col.default_value}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">
                        No default value
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditColumnDialog(col)}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteColumn(col.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Custom Column Dialog */}
      <Dialog open={showAddColumnDialog} onOpenChange={setShowAddColumnDialog}>
        <DialogContent
          className="max-w-md"
          onClose={() => {
            setShowAddColumnDialog(false);
            resetColumnForm();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editingColumn ? "Edit Custom Column" : "Add Custom Column"}
            </DialogTitle>
            <DialogDescription>
              {editingColumn
                ? "Update the column name or default value."
                : "Create a new custom column. It will appear in campaign generation dialogs and as a template placeholder."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="col-name">Column Name</Label>
              <Input
                id="col-name"
                placeholder="e.g. linkedin_url, referral_source"
                value={columnForm.name}
                onChange={(e) =>
                  setColumnForm((p) => ({ ...p, name: e.target.value }))
                }
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSaveColumn()}
              />
              <p className="text-[11px] text-muted-foreground">
                Use in templates as{" "}
                <code className="font-mono bg-muted px-1 rounded">{`{${columnForm.name || "column_name"}}`}</code>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="col-default">Default Value</Label>
              <Input
                id="col-default"
                placeholder="Leave empty for no default"
                value={columnForm.default_value}
                onChange={(e) =>
                  setColumnForm((p) => ({
                    ...p,
                    default_value: e.target.value,
                  }))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Auto-populated when creating new campaign rows (can be
                overridden per-batch)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddColumnDialog(false);
                resetColumnForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveColumn} disabled={columnSaving}>
              {columnSaving ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <Save size={14} className="mr-1" />
              )}
              {editingColumn ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================= */}
      {/* Email Accounts Section                                         */}
      {/* ============================================================= */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Mail size={16} />
            Email Accounts
          </CardTitle>
          <Button size="sm" onClick={openAddDialog}>
            <Plus size={14} className="mr-1" /> Add Account
          </Button>
        </CardHeader>
        <CardContent>
          {/* Info banner */}
          <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-800">
            <strong>Daily sending limits:</strong> Gmail SMTP ~500/day &middot;
            Outlook SMTP ~300/day &middot; Resend Free 100/day (3K/month)
            &middot; Resend Pro $20/mo for 50K/mo
          </div>

          {accountsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No email accounts configured yet. Add one to start sending.
            </p>
          ) : (
            <div className="space-y-2">
              {accounts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted/50 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Mail
                      size={16}
                      className="shrink-0 text-muted-foreground"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {a.display_name
                            ? `${a.display_name} <${a.email}>`
                            : a.email}
                        </span>
                        {a.is_default && (
                          <Star
                            size={12}
                            className="text-yellow-500 fill-yellow-500 shrink-0"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge
                          variant={
                            a.provider === "resend" ? "secondary" : "default"
                          }
                          className="text-[10px] px-1.5 py-0"
                        >
                          {a.provider === "resend" ? "Resend" : "SMTP"}
                        </Badge>
                        {a.smtp_host && (
                          <span className="text-[10px] text-muted-foreground">
                            {a.smtp_host}:{a.smtp_port}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(a)}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteAccount(a.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================================= */}
      {/* Add / Edit Account Dialog                                      */}
      {/* ============================================================= */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent
          className="max-w-md"
          onClose={() => {
            setShowAddDialog(false);
            resetAccountForm();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? "Edit Email Account" : "Add Email Account"}
            </DialogTitle>
            <DialogDescription>
              {editingAccount
                ? "Update account settings. Leave credential empty to keep the existing one."
                : "Add a new sender email account. Credentials are encrypted via Supabase Vault."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Provider toggle */}
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleProviderChange("smtp")}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-sm transition cursor-pointer ${
                    accountForm.provider === "smtp"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Mail size={20} />
                  <span className="font-medium">SMTP</span>
                  <span className="text-[10px] text-muted-foreground">
                    Gmail, Outlook, etc.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleProviderChange("resend")}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-sm transition cursor-pointer ${
                    accountForm.provider === "resend"
                      ? "border-purple-500 bg-purple-50 text-purple-700"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Mail size={20} />
                  <span className="font-medium">Resend</span>
                  <span className="text-[10px] text-muted-foreground">
                    API-based delivery
                  </span>
                </button>
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="acc-email">From Email</Label>
              <Input
                id="acc-email"
                type="email"
                placeholder={
                  accountForm.provider === "smtp"
                    ? "you@gmail.com"
                    : "noreply@yourdomain.com"
                }
                value={accountForm.email}
                onChange={(e) =>
                  setAccountForm((p) => ({ ...p, email: e.target.value }))
                }
              />
            </div>

            {/* Display Name */}
            <div className="space-y-1.5">
              <Label htmlFor="acc-name">Display Name</Label>
              <Input
                id="acc-name"
                placeholder="John Doe"
                value={accountForm.display_name}
                onChange={(e) =>
                  setAccountForm((p) => ({
                    ...p,
                    display_name: e.target.value,
                  }))
                }
              />
            </div>

            {/* SMTP-specific fields */}
            {accountForm.provider === "smtp" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="acc-host">SMTP Host</Label>
                  <Input
                    id="acc-host"
                    placeholder="smtp.gmail.com"
                    value={accountForm.smtp_host || ""}
                    onChange={(e) =>
                      setAccountForm((p) => ({
                        ...p,
                        smtp_host: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="acc-port">Port</Label>
                  <Input
                    id="acc-port"
                    type="number"
                    placeholder="465"
                    value={accountForm.smtp_port || ""}
                    onChange={(e) =>
                      setAccountForm((p) => ({
                        ...p,
                        smtp_port: parseInt(e.target.value) || null,
                      }))
                    }
                  />
                </div>
              </div>
            )}

            {/* Credential */}
            <div className="space-y-1.5">
              <Label htmlFor="acc-credential">
                {accountForm.provider === "smtp" ? "App Password" : "API Key"}
              </Label>
              <Input
                id="acc-credential"
                type="password"
                placeholder={
                  editingAccount
                    ? "Leave empty to keep existing"
                    : accountForm.provider === "smtp"
                      ? "Gmail App Password"
                      : "re_xxxxxxxxxxxx"
                }
                value={accountForm.credential}
                onChange={(e) =>
                  setAccountForm((p) => ({
                    ...p,
                    credential: e.target.value,
                  }))
                }
              />
              {accountForm.provider === "smtp" && (
                <p className="text-[11px] text-muted-foreground">
                  For Gmail, enable 2FA then create an{" "}
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-blue-600"
                  >
                    App Password
                  </a>
                </p>
              )}
            </div>

            {/* Default toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={accountForm.is_default}
                onChange={(e) =>
                  setAccountForm((p) => ({
                    ...p,
                    is_default: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm">Set as default sender</span>
            </label>

            {/* Organization Details — shown for non-consumer email domains */}
            {isOrgEmail(accountForm.email) && (
              <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                  <Building2 size={15} />
                  Organization Details
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">
                  This looks like an organization email. Add details so the admin can categorize it.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="acc-org-name">Organization Name</Label>
                    <Input
                      id="acc-org-name"
                      placeholder="e.g. Google, MIT, Stanford"
                      value={accountForm.organization_name || ""}
                      onChange={(e) =>
                        setAccountForm((p) => ({
                          ...p,
                          organization_name: e.target.value || null,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="acc-org-type">Type</Label>
                    <select
                      id="acc-org-type"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                      value={accountForm.organization_type || ""}
                      onChange={(e) =>
                        setAccountForm((p) => ({
                          ...p,
                          organization_type: e.target.value || null,
                        }))
                      }
                    >
                      <option value="">Select type</option>
                      <option value="university">University</option>
                      <option value="company">Company</option>
                      <option value="nonprofit">Non-Profit</option>
                      <option value="government">Government</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="acc-title">Title / Role</Label>
                    <Input
                      id="acc-title"
                      placeholder="e.g. Student, SWE Intern"
                      value={accountForm.title || ""}
                      onChange={(e) =>
                        setAccountForm((p) => ({
                          ...p,
                          title: e.target.value || null,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="acc-city">City</Label>
                    <Input
                      id="acc-city"
                      placeholder="e.g. San Francisco, CA"
                      value={accountForm.city || ""}
                      onChange={(e) =>
                        setAccountForm((p) => ({
                          ...p,
                          city: e.target.value || null,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Test result */}
            {testResult && (
              <div
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  testResult.status === "ok"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {testResult.status === "ok" ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <XCircle size={16} />
                )}
                {testResult.detail}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleTestCredential}
              disabled={
                accountTesting || (!accountForm.credential && !editingAccount)
              }
            >
              {accountTesting ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <FlaskConical size={14} className="mr-1" />
              )}
              {accountTesting ? "Testing..." : "Test Connection"}
            </Button>
            <Button onClick={handleSaveAccount} disabled={accountSaving}>
              {accountSaving ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <Save size={14} className="mr-1" />
              )}
              {editingAccount ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
