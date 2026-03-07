import { useEffect, useState, useCallback } from "react";
import { Loader2, RefreshCw, CalendarX2, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import {
  getOooContacts,
  clearOooContacts,
  clearAllOooContacts,
  expireOooContacts,
} from "../../api/client";
import type { OooContact } from "../../api/client";

interface OooManagementTabProps {
  onBounceDataChanged?: () => void;
}

export default function OooManagementTab({
  onBounceDataChanged,
}: OooManagementTabProps) {
  const [oooContacts, setOooContacts] = useState<OooContact[]>([]);
  const [oooLoading, setOooLoading] = useState(false);
  const [selectedOoo, setSelectedOoo] = useState<Set<string>>(new Set());
  const [oooClearing, setOooClearing] = useState(false);
  const [oooExpiring, setOooExpiring] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const fetchOooContacts = useCallback(async () => {
    setOooLoading(true);
    try {
      setOooContacts(await getOooContacts());
    } catch {
      toast.error("Failed to load OOO contacts");
    } finally {
      setOooLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOooContacts();
  }, [fetchOooContacts]);

  const handleClearSelectedOoo = async () => {
    if (selectedOoo.size === 0) return;
    setOooClearing(true);
    try {
      const result = await clearOooContacts(Array.from(selectedOoo));
      toast.success(`Cleared OOO from ${result.cleared} contacts`);
      setSelectedOoo(new Set());
      fetchOooContacts();
      onBounceDataChanged?.();
    } catch {
      toast.error("Failed to clear OOO contacts");
    } finally {
      setOooClearing(false);
    }
  };

  const handleClearAllOoo = async () => {
    setOooClearing(true);
    try {
      const result = await clearAllOooContacts();
      toast.success(`Cleared OOO from ${result.cleared} contacts`);
      setSelectedOoo(new Set());
      fetchOooContacts();
      onBounceDataChanged?.();
    } catch {
      toast.error("Failed to clear all OOO contacts");
    } finally {
      setOooClearing(false);
    }
  };

  const handleExpireOoo = async () => {
    setOooExpiring(true);
    try {
      const result = await expireOooContacts();
      toast.success(`Expired ${result.expired} OOO contacts past return date`);
      fetchOooContacts();
      onBounceDataChanged?.();
    } catch {
      toast.error("Failed to expire OOO contacts");
    } finally {
      setOooExpiring(false);
    }
  };

  const toggleOooSelection = (id: string) => {
    setSelectedOoo((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllOoo = () => {
    if (selectedOoo.size === oooContacts.length) {
      setSelectedOoo(new Set());
    } else {
      setSelectedOoo(new Set(oooContacts.map((c) => c.id)));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manage Out-of-Office contacts — auto-expire past return dates or
          manually clear OOO notes.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExpireOoo}
            disabled={oooExpiring}
          >
            {oooExpiring ? (
              <Loader2 size={14} className="mr-1 animate-spin" />
            ) : (
              <CalendarX2 size={14} className="mr-1" />
            )}
            Auto-Expire
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleClearSelectedOoo}
            disabled={oooClearing || selectedOoo.size === 0}
          >
            {oooClearing ? (
              <Loader2 size={14} className="mr-1 animate-spin" />
            ) : (
              <UserX size={14} className="mr-1" />
            )}
            Clear Selected ({selectedOoo.size})
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmClearAll(true)}
            disabled={oooClearing || oooContacts.length === 0}
          >
            Clear All
          </Button>
          <Button size="sm" variant="ghost" onClick={fetchOooContacts}>
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {oooLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin w-5 h-5 text-muted-foreground" />
        </div>
      ) : oooContacts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No contacts with OOO notes found.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={
                      selectedOoo.size === oooContacts.length &&
                      oooContacts.length > 0
                    }
                    onChange={toggleAllOoo}
                    className="rounded"
                  />
                </th>
                <th className="text-left px-3 py-2 font-medium">Type</th>
                <th className="text-left px-3 py-2 font-medium">Name</th>
                <th className="text-left px-3 py-2 font-medium">Email</th>
                <th className="text-left px-3 py-2 font-medium">Company</th>
                <th className="text-left px-3 py-2 font-medium">OOO Date</th>
                <th className="text-left px-3 py-2 font-medium">Return Date</th>
                <th className="text-left px-3 py-2 font-medium max-w-[200px]">
                  Message
                </th>
              </tr>
            </thead>
            <tbody>
              {oooContacts.map((c) => {
                const isExpired =
                  c.ooo_return_date &&
                  new Date(c.ooo_return_date) <= new Date();
                return (
                  <tr
                    key={`${c.type}-${c.id}`}
                    className={`border-b last:border-b-0 ${
                      isExpired
                        ? "bg-red-50/50"
                        : c.ooo_return_date
                          ? "bg-amber-50/30"
                          : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedOoo.has(c.id)}
                        onChange={() => toggleOooSelection(c.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={
                          c.type === "recruiter" ? "default" : "secondary"
                        }
                        className="text-xs"
                      >
                        {c.type}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-medium">{c.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.email}</td>
                    <td className="px-3 py-2 text-xs">{c.company || "—"}</td>
                    <td className="px-3 py-2 text-xs">{c.ooo_date || "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {c.ooo_return_date ? (
                        <span
                          className={
                            isExpired
                              ? "text-red-600 font-medium"
                              : "text-amber-600"
                          }
                        >
                          {c.ooo_return_date}
                          {isExpired && " (expired)"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs max-w-[200px] truncate">
                      {c.ooo_message}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm Clear All dialog */}
      <AlertDialog open={confirmClearAll} onOpenChange={setConfirmClearAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All OOO Contacts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the Out-of-Office status from all{" "}
              {oooContacts.length} contacts. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setConfirmClearAll(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmClearAll(false);
                handleClearAllOoo();
              }}
            >
              Clear All
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
