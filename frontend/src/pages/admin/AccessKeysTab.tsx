import { useEffect, useState, useCallback } from "react";
import { KeyRound, Plus, Trash2, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
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
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import {
  listAccessKeys,
  generateAccessKey,
  revokeAccessKey,
} from "../../api/client";
import type { AccessKeyItem } from "../../api/client";

export default function AccessKeysTab() {
  const [keys, setKeys] = useState<AccessKeyItem[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [showGenDialog, setShowGenDialog] = useState(false);
  const [genLabel, setGenLabel] = useState("");
  const [genNotifyEmail, setGenNotifyEmail] = useState("");
  const [generating, setGenerating] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

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

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateAccessKey(
        genLabel,
        genNotifyEmail || undefined,
      );
      setNewlyCreatedKey(result.key);
      toast.success(
        genNotifyEmail
          ? "Access key generated & emailed"
          : "Access key generated",
      );
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

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Generate single-use access keys for users to enter the app.
          </p>
          <Button
            size="sm"
            onClick={() => {
              setGenLabel("");
              setGenNotifyEmail("");
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
                      {k.key_prefix ?? "—"}...
                    </td>
                    <td className="px-4 py-2">{k.label || "—"}</td>
                    <td className="px-4 py-2">
                      {!k.is_active ? (
                        <span className="text-red-600 text-xs font-medium">
                          Revoked
                        </span>
                      ) : k.used_by_user_id ? (
                        <span className="text-amber-600 text-xs font-medium">
                          Used
                        </span>
                      ) : (
                        <span className="text-green-600 text-xs font-medium">
                          Available
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {k.used_by_user_id
                        ? `${k.used_by_user_id.slice(0, 12)}...`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {k.created_at
                        ? new Date(k.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {k.is_active && !k.used_by_user_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setRevokeTarget(k.id)}
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
      </div>

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
              <div className="space-y-1.5">
                <Label htmlFor="key-notify-email">
                  Email to notify (optional)
                </Label>
                <Input
                  id="key-notify-email"
                  type="email"
                  placeholder="user@example.com"
                  value={genNotifyEmail}
                  onChange={(e) => setGenNotifyEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  If set, the access key will be emailed to this address.
                </p>
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

      {/* Revoke Key Confirmation */}
      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Access Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently revoke this access key. The user who
              received it will no longer be able to use it to enter the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (revokeTarget) handleRevoke(revokeTarget);
                setRevokeTarget(null);
              }}
            >
              Revoke
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
