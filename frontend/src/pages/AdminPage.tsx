import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  KeyRound,
  Plus,
  Trash2,
  Loader2,
  Building2,
  Copy,
  Check,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  checkAdmin,
  listAccessKeys,
  generateAccessKey,
  revokeAccessKey,
  listOrgAccounts,
} from "../api/client";
import type { AccessKeyItem, OrgAccount } from "../api/client";

export default function AdminPage() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // Access Keys state
  const [keys, setKeys] = useState<AccessKeyItem[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [showGenDialog, setShowGenDialog] = useState(false);
  const [genLabel, setGenLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Org Accounts state
  const [orgAccounts, setOrgAccounts] = useState<OrgAccount[]>([]);
  const [orgLoading, setOrgLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("access-keys");

  // Check admin
  useEffect(() => {
    checkAdmin()
      .then((res) => {
        if (!res.is_admin) {
          toast.error("Admin access required");
          navigate("/");
        } else {
          setIsAdmin(true);
        }
      })
      .catch(() => {
        toast.error("Admin access required");
        navigate("/");
      });
  }, [navigate]);

  const fetchKeys = useCallback(async () => {
    setKeysLoading(true);
    try {
      setKeys(await listAccessKeys());
    } catch {
      toast.error("Failed to load access keys");
    } finally {
      setKeysLoading(false);
    }
  }, []);

  const fetchOrgAccounts = useCallback(async () => {
    setOrgLoading(true);
    try {
      setOrgAccounts(await listOrgAccounts());
    } catch {
      toast.error("Failed to load organization accounts");
    } finally {
      setOrgLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchKeys();
      fetchOrgAccounts();
    }
  }, [isAdmin, fetchKeys, fetchOrgAccounts]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateAccessKey(genLabel);
      setNewlyCreatedKey(result.key);
      toast.success("Access key generated");
      fetchKeys();
    } catch {
      toast.error("Failed to generate key");
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeAccessKey(id);
      toast.success("Key revoked");
      fetchKeys();
    } catch {
      toast.error("Failed to revoke key");
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin w-6 h-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Admin Panel</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="access-keys" className="gap-1.5">
            <KeyRound size={14} /> Access Keys
          </TabsTrigger>
          <TabsTrigger value="org-accounts" className="gap-1.5">
            <Building2 size={14} /> Org Accounts
          </TabsTrigger>
        </TabsList>

        {/* ── Access Keys Tab ── */}
        <TabsContent value="access-keys" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Generate single-use access keys for users to enter the app.
            </p>
            <Button
              size="sm"
              onClick={() => {
                setGenLabel("");
                setNewlyCreatedKey(null);
                setCopied(false);
                setShowGenDialog(true);
              }}
            >
              <Plus size={14} className="mr-1" /> Generate Key
            </Button>
          </div>

          {keysLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin w-5 h-5 text-muted-foreground" />
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No access keys yet. Generate one to invite a user.
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Key</th>
                    <th className="text-left px-4 py-2 font-medium">Label</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-left px-4 py-2 font-medium">Used By</th>
                    <th className="text-left px-4 py-2 font-medium">Created</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2 font-mono text-xs">
                        {k.key.slice(0, 8)}...
                      </td>
                      <td className="px-4 py-2">{k.label || "—"}</td>
                      <td className="px-4 py-2">
                        {!k.is_active ? (
                          <span className="text-red-600 text-xs font-medium">Revoked</span>
                        ) : k.used_by_user_id ? (
                          <span className="text-amber-600 text-xs font-medium">Used</span>
                        ) : (
                          <span className="text-green-600 text-xs font-medium">Available</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {k.used_by_user_id
                          ? `${k.used_by_user_id.slice(0, 12)}...`
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {k.created_at ? new Date(k.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {k.is_active && !k.used_by_user_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleRevoke(k.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Org Accounts Tab ── */}
        <TabsContent value="org-accounts" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Organization email accounts added by users (school / company emails).
          </p>

          {orgLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin w-5 h-5 text-muted-foreground" />
            </div>
          ) : orgAccounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No organization accounts found.
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Email</th>
                    <th className="text-left px-4 py-2 font-medium">Org Name</th>
                    <th className="text-left px-4 py-2 font-medium">Type</th>
                    <th className="text-left px-4 py-2 font-medium">Title</th>
                    <th className="text-left px-4 py-2 font-medium">City</th>
                    <th className="text-left px-4 py-2 font-medium">User</th>
                  </tr>
                </thead>
                <tbody>
                  {orgAccounts.map((a) => (
                    <tr key={a.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2">{a.email}</td>
                      <td className="px-4 py-2">
                        {a.organization_name || "—"}
                      </td>
                      <td className="px-4 py-2 capitalize">
                        {a.organization_type || "—"}
                      </td>
                      <td className="px-4 py-2">{a.title || "—"}</td>
                      <td className="px-4 py-2">{a.city || "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {a.user_id ? `${a.user_id.slice(0, 12)}...` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Generate Key Dialog ── */}
      <Dialog open={showGenDialog} onOpenChange={setShowGenDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Access Key</DialogTitle>
          </DialogHeader>

          {newlyCreatedKey ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Copy this key now — you won't be able to see it again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono break-all">
                  {newlyCreatedKey}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(newlyCreatedKey)}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="key-label">Label (optional)</Label>
                <Input
                  id="key-label"
                  placeholder="e.g. John Doe"
                  value={genLabel}
                  onChange={(e) => setGenLabel(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {newlyCreatedKey ? (
              <Button onClick={() => setShowGenDialog(false)}>Done</Button>
            ) : (
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? (
                  <Loader2 size={14} className="mr-1 animate-spin" />
                ) : (
                  <KeyRound size={14} className="mr-1" />
                )}
                {generating ? "Generating..." : "Generate"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
