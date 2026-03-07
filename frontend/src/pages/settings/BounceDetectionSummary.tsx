import { useState, useEffect, useCallback } from "react";
import { getBounceStats, type BounceStats } from "@/api/client";
import { MailWarning, ShieldAlert, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function BounceDetectionSummary() {
  const [bounceStats, setBounceStats] = useState<BounceStats | null>(null);

  const loadBounceStats = useCallback(async () => {
    try {
      const data = await getBounceStats();
      setBounceStats(data);
    } catch {
      // silently ignore — bounce detection may not be set up yet
    }
  }, []);

  useEffect(() => {
    loadBounceStats();
  }, [loadBounceStats]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <MailWarning size={16} />
          Bounce Detection
        </CardTitle>
      </CardHeader>
      <CardContent>
        {bounceStats ? (
          <div className="space-y-3">
            {/* Enabled / Paused badge */}
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${bounceStats.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}
              >
                {bounceStats.enabled ? "Scanning Active" : "Scanning Paused"}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold">
                  {bounceStats.total_contacts}
                </div>
                <div className="text-xs text-muted-foreground">
                  Total Contacts
                </div>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {bounceStats.valid_contacts}
                </div>
                <div className="text-xs text-green-600">Valid</div>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                <div className="text-2xl font-bold text-red-600 flex items-center justify-center gap-1">
                  <ShieldAlert size={18} />
                  {bounceStats.bounced_contacts}
                </div>
                <div className="text-xs text-red-600">Bounced</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                <div className="text-2xl font-bold text-amber-600">
                  {bounceStats.risky_contacts}
                </div>
                <div className="text-xs text-amber-600">Risky</div>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {bounceStats.ooo_contacts}
                </div>
                <div className="text-xs text-blue-600">OOO</div>
              </div>
            </div>
            {bounceStats.last_check && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ShieldCheck size={12} />
                Last scan: {new Date(bounceStats.last_check).toLocaleString()}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Bounced contacts are automatically excluded from campaign
              generation. Manage bounce details &amp; toggle scanning in the
              Admin page.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Bounce detection stats will appear here once scanning begins.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
