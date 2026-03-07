import { useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listOrgAccounts } from "../../api/client";
import type { OrgAccount } from "../../api/client";

export default function OrgAccountsTab() {
  const [orgAccounts, setOrgAccounts] = useState<OrgAccount[]>([]);
  const [orgLoading, setOrgLoading] = useState(false);

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
    fetchOrgAccounts();
  }, [fetchOrgAccounts]);

  return (
    <div className="space-y-4">
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
                  <td className="px-4 py-2">{a.organization_name || "—"}</td>
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
    </div>
  );
}
