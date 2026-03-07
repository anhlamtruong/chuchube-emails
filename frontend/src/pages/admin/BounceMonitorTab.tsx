import { useEffect, useState, useCallback, useRef } from "react";
import {
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Users,
  Check,
  Settings2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  getBounceLogs,
  getBounceStats,
  triggerBounceScan,
  getBounceScanStatus,
  resetContactStatus,
  toggleBounceScan,
  getBounceScanConfig,
  updateBounceScanConfig,
  subscribeScanStream,
} from "../../api/client";
import type {
  BounceLogItem,
  BounceStats,
  BounceScanProgress,
  BounceScanConfig,
  ScanEmailEvent,
} from "../../api/client";

export default function BounceMonitorTab() {
  const [bounceLogs, setBounceLogs] = useState<BounceLogItem[]>([]);
  const [bounceStats, setBounceStats] = useState<BounceStats | null>(null);
  const [bounceLoading, setBounceLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<BounceScanProgress | null>(
    null,
  );
  const [toggling, setToggling] = useState(false);

  // Scan config state
  const [scanConfig, setScanConfig] = useState<BounceScanConfig>({
    since_days: 3,
    max_messages: 200,
  });
  const [scanConfigLoading, setScanConfigLoading] = useState(false);
  const [scanConfigSaving, setScanConfigSaving] = useState(false);

  // SSE live feed state
  const [emailEvents, setEmailEvents] = useState<ScanEmailEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBounceData = useCallback(async () => {
    setBounceLoading(true);
    try {
      const [stats, logs] = await Promise.all([
        getBounceStats(),
        getBounceLogs({ limit: 100 }),
      ]);
      setBounceStats(stats);
      setBounceLogs(logs);
    } catch {
      toast.error("Failed to load bounce data");
    } finally {
      setBounceLoading(false);
    }
  }, []);

  const fetchScanStatus = useCallback(async () => {
    try {
      const progress = await getBounceScanStatus();
      if (progress.status !== "idle") {
        setScanProgress(progress);
        if (progress.status === "running") {
          setScanning(true);
        }
      }
    } catch {
      // Ignore — scan status not critical
    }
  }, []);

  const fetchScanConfig = useCallback(async () => {
    setScanConfigLoading(true);
    try {
      setScanConfig(await getBounceScanConfig());
    } catch {
      // use defaults
    } finally {
      setScanConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBounceData();
    fetchScanStatus();
    fetchScanConfig();
  }, [fetchBounceData, fetchScanStatus, fetchScanConfig]);

  // Clean up SSE and polling interval on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // Auto-scroll SSE feed
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [emailEvents]);

  const startSseFeed = async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setEmailEvents([]);
    const es = await subscribeScanStream();
    eventSourceRef.current = es;

    es.addEventListener("email", (evt) => {
      try {
        const data = JSON.parse(evt.data) as ScanEmailEvent;
        setEmailEvents((prev) => {
          const next = [...prev, data];
          return next.length > 500 ? next.slice(-400) : next;
        });
      } catch {
        /* ignore parse errors */
      }
    });

    es.addEventListener("done", () => {
      es.close();
      eventSourceRef.current = null;
    });

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
    };
  };

  const handleScan = async () => {
    setScanning(true);
    setScanProgress(null);
    setEmailEvents([]);
    // Clear any previous polling interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    try {
      await triggerBounceScan();
      startSseFeed();
      pollIntervalRef.current = setInterval(async () => {
        try {
          const progress = await getBounceScanStatus();
          setScanProgress(progress);
          if (progress.status === "done" || progress.status === "error") {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setScanning(false);
            if (progress.status === "done") {
              toast.success(
                `Scan complete: ${progress.bounces} bounces, ${progress.ooo} OOO found`,
              );
            } else {
              toast.error(
                `Scan finished with errors: ${progress.errors[0] || "unknown"}`,
              );
            }
            fetchBounceData();
          }
        } catch {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setScanning(false);
          toast.error("Failed to get scan status");
        }
      }, 2000);
    } catch (e: unknown) {
      setScanning(false);
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("409")) {
        toast.error("A scan is already running");
      } else {
        toast.error("Failed to start bounce scan");
      }
    }
  };

  const handleToggleScan = async () => {
    setToggling(true);
    try {
      const result = await toggleBounceScan();
      toast.success(
        result.enabled ? "Bounce scanning enabled" : "Bounce scanning paused",
      );
      fetchBounceData();
    } catch {
      toast.error("Failed to toggle bounce scanning");
    } finally {
      setToggling(false);
    }
  };

  const handleResetStatus = async (email: string) => {
    try {
      await resetContactStatus(email);
      toast.success(`Reset status for ${email}`);
      fetchBounceData();
    } catch {
      toast.error("Failed to reset contact status");
    }
  };

  const handleSaveScanConfig = async () => {
    setScanConfigSaving(true);
    try {
      const result = await updateBounceScanConfig(scanConfig);
      setScanConfig(result);
      toast.success("Scan config saved");
    } catch {
      toast.error("Failed to save scan config");
    } finally {
      setScanConfigSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toggle bar + scan button */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <Switch
            checked={bounceStats?.enabled ?? false}
            onCheckedChange={() => handleToggleScan()}
            disabled={toggling}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Auto-Scan</span>
              {bounceStats?.enabled ? (
                <Badge
                  variant="default"
                  className="text-xs bg-green-600 hover:bg-green-600"
                >
                  Active
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  Paused
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {bounceStats?.enabled
                ? "Background scan runs every 5 minutes"
                : "Toggle on to resume automatic bounce checking"}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={handleScan} disabled={scanning}>
          {scanning ? (
            <Loader2 size={14} className="mr-1 animate-spin" />
          ) : (
            <RefreshCw size={14} className="mr-1" />
          )}
          {scanning ? "Scanning..." : "Run Scan Now"}
        </Button>
      </div>

      {/* Scan progress bar */}
      {scanProgress && scanProgress.status === "running" && (
        <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Scanning account {scanProgress.accounts_done + 1} of{" "}
              {scanProgress.total_accounts}
            </span>
            <span className="text-muted-foreground text-xs">
              {scanProgress.checked} emails checked
            </span>
          </div>
          {scanProgress.current_account && (
            <p className="text-xs text-muted-foreground truncate">
              {scanProgress.current_account}
            </p>
          )}
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-500"
              style={{
                width:
                  scanProgress.total_accounts > 0
                    ? `${(scanProgress.accounts_done / scanProgress.total_accounts) * 100}%`
                    : "0%",
              }}
            />
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>{scanProgress.bounces} bounces</span>
            <span>{scanProgress.ooo} OOO</span>
            {scanProgress.errors.length > 0 && (
              <span className="text-red-500">
                {scanProgress.errors.length} errors
              </span>
            )}
          </div>
        </div>
      )}
      {scanProgress && scanProgress.status === "done" && (
        <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-green-700">
            <ShieldCheck size={16} />
            Last Scan — Completed Successfully
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-md bg-white/80 border border-green-100 p-2 text-center">
              <div className="text-xs text-muted-foreground">
                Accounts Scanned
              </div>
              <div className="text-lg font-bold">
                {scanProgress.accounts_done}
              </div>
            </div>
            <div className="rounded-md bg-white/80 border border-green-100 p-2 text-center">
              <div className="text-xs text-muted-foreground">
                Emails Checked
              </div>
              <div className="text-lg font-bold">{scanProgress.checked}</div>
            </div>
            <div className="rounded-md bg-white/80 border border-green-100 p-2 text-center">
              <div className="text-xs text-muted-foreground">Bounces Found</div>
              <div className="text-lg font-bold text-red-600">
                {scanProgress.bounces}
              </div>
            </div>
            <div className="rounded-md bg-white/80 border border-green-100 p-2 text-center">
              <div className="text-xs text-muted-foreground">OOO Detected</div>
              <div className="text-lg font-bold text-blue-600">
                {scanProgress.ooo}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {scanProgress.started_at && (
              <span>
                Started: {new Date(scanProgress.started_at).toLocaleString()}
              </span>
            )}
            {scanProgress.finished_at && (
              <span>
                Finished: {new Date(scanProgress.finished_at).toLocaleString()}
              </span>
            )}
            {scanProgress.started_at && scanProgress.finished_at && (
              <span>
                Duration:{" "}
                {Math.round(
                  (new Date(scanProgress.finished_at).getTime() -
                    new Date(scanProgress.started_at).getTime()) /
                    1000,
                )}
                s
              </span>
            )}
          </div>
          {scanProgress.errors.length > 0 && (
            <div className="text-xs text-amber-600">
              {scanProgress.errors.length} error(s):{" "}
              {scanProgress.errors.slice(0, 3).join(", ")}
            </div>
          )}
        </div>
      )}
      {scanProgress && scanProgress.status === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-red-700">
            <ShieldX size={16} />
            Last Scan — Failed
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-md bg-white/80 border border-red-100 p-2 text-center">
              <div className="text-xs text-muted-foreground">
                Accounts Scanned
              </div>
              <div className="text-lg font-bold">
                {scanProgress.accounts_done}
              </div>
            </div>
            <div className="rounded-md bg-white/80 border border-red-100 p-2 text-center">
              <div className="text-xs text-muted-foreground">
                Emails Checked
              </div>
              <div className="text-lg font-bold">{scanProgress.checked}</div>
            </div>
            <div className="rounded-md bg-white/80 border border-red-100 p-2 text-center">
              <div className="text-xs text-muted-foreground">Bounces Found</div>
              <div className="text-lg font-bold text-red-600">
                {scanProgress.bounces}
              </div>
            </div>
            <div className="rounded-md bg-white/80 border border-red-100 p-2 text-center">
              <div className="text-xs text-muted-foreground">OOO Detected</div>
              <div className="text-lg font-bold text-blue-600">
                {scanProgress.ooo}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {scanProgress.started_at && (
              <span>
                Started: {new Date(scanProgress.started_at).toLocaleString()}
              </span>
            )}
            {scanProgress.finished_at && (
              <span>
                Finished: {new Date(scanProgress.finished_at).toLocaleString()}
              </span>
            )}
          </div>
          <div className="rounded-md bg-red-100/60 p-2 text-xs text-red-700">
            {scanProgress.errors.length > 0
              ? scanProgress.errors.map((e, i) => <div key={i}>• {e}</div>)
              : "Unknown error"}
          </div>
        </div>
      )}

      {/* ── Scan Settings ── */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Settings2 size={14} />
            Scan Settings
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveScanConfig}
            disabled={scanConfigSaving || scanConfigLoading}
          >
            {scanConfigSaving ? (
              <Loader2 size={14} className="mr-1 animate-spin" />
            ) : (
              <Check size={14} className="mr-1" />
            )}
            Save
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="since-days" className="text-xs">
              SINCE Days (1-30)
            </Label>
            <Input
              id="since-days"
              type="number"
              min={1}
              max={30}
              value={scanConfig.since_days}
              onChange={(e) =>
                setScanConfig((c) => ({
                  ...c,
                  since_days: Math.max(
                    1,
                    Math.min(30, parseInt(e.target.value) || 3),
                  ),
                }))
              }
              className="h-8"
            />
            <p className="text-xs text-muted-foreground">
              How far back to search IMAP inbox
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="max-msgs" className="text-xs">
              Max Messages per Account (50-1000)
            </Label>
            <Input
              id="max-msgs"
              type="number"
              min={50}
              max={1000}
              step={50}
              value={scanConfig.max_messages}
              onChange={(e) =>
                setScanConfig((c) => ({
                  ...c,
                  max_messages: Math.max(
                    50,
                    Math.min(1000, parseInt(e.target.value) || 200),
                  ),
                }))
              }
              className="h-8"
            />
            <p className="text-xs text-muted-foreground">
              Limit emails scanned per sender account
            </p>
          </div>
        </div>
      </div>

      {/* ── SSE Live Feed ── */}
      {scanning && emailEvents.length > 0 && (
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Zap size={14} className="text-amber-500" />
              Live Email Feed
              <Badge variant="secondary" className="text-xs">
                {emailEvents.length} emails
              </Badge>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/20 p-2 space-y-1 text-xs font-mono">
            {emailEvents.map((evt, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <Badge
                  variant={
                    evt.classification === "hard_bounce"
                      ? "destructive"
                      : evt.classification === "soft_bounce"
                        ? "secondary"
                        : evt.classification === "ooo"
                          ? "outline"
                          : "default"
                  }
                  className="text-[10px] min-w-[70px] justify-center"
                >
                  {evt.classification === "normal"
                    ? "ok"
                    : evt.classification.replace("_bounce", "")}
                </Badge>
                <span className="text-muted-foreground truncate max-w-[120px]">
                  {evt.from_addr}
                </span>
                <span className="truncate flex-1 text-foreground/70">
                  {evt.subject || "(no subject)"}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {evt.method}
                </Badge>
              </div>
            ))}
            <div ref={feedEndRef} />
          </div>
        </div>
      )}

      {/* Contact status overview */}
      {bounceStats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="rounded-lg border p-3 text-center">
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Users size={12} /> Total Contacts
              </div>
              <div className="text-2xl font-bold mt-1">
                {bounceStats.total_contacts}
              </div>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
              <div className="text-xs text-green-700 flex items-center justify-center gap-1">
                <ShieldCheck size={12} /> Valid
              </div>
              <div className="text-2xl font-bold text-green-600 mt-1">
                {bounceStats.valid_contacts}
              </div>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
              <div className="text-xs text-red-700 flex items-center justify-center gap-1">
                <ShieldX size={12} /> Bounced
              </div>
              <div className="text-2xl font-bold text-red-600 mt-1">
                {bounceStats.bounced_contacts}
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
              <div className="text-xs text-amber-700 flex items-center justify-center gap-1">
                <ShieldAlert size={12} /> Risky
              </div>
              <div className="text-2xl font-bold text-amber-600 mt-1">
                {bounceStats.risky_contacts}
              </div>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
              <div className="text-xs text-blue-700">OOO</div>
              <div className="text-2xl font-bold text-blue-600 mt-1">
                {bounceStats.ooo_contacts}
              </div>
            </div>
          </div>

          {/* Bounce breakdown */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Hard Bounces</div>
              <div className="text-xl font-bold text-red-600">
                {bounceStats.hard_bounces}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Soft Bounces</div>
              <div className="text-xl font-bold text-amber-600">
                {bounceStats.soft_bounces}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Total Bounce Events
              </div>
              <div className="text-xl font-bold">
                {bounceStats.total_bounces}
              </div>
            </div>
          </div>
        </>
      )}
      {bounceStats?.last_check && (
        <p className="text-xs text-muted-foreground">
          Last check: {new Date(bounceStats.last_check).toLocaleString()}
        </p>
      )}

      {/* Bounce logs table */}
      {bounceLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin w-5 h-5 text-muted-foreground" />
        </div>
      ) : bounceLogs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No bounce events detected yet.
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Recipient</th>
                <th className="text-left px-4 py-2 font-medium">Subject</th>
                <th className="text-left px-4 py-2 font-medium">Method</th>
                <th className="text-left px-4 py-2 font-medium">Action</th>
                <th className="text-left px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {bounceLogs.map((log) => (
                <tr key={log.id} className="border-b last:border-b-0">
                  <td className="px-4 py-2">
                    <Badge
                      variant={
                        log.bounce_type === "hard"
                          ? "destructive"
                          : log.bounce_type === "soft"
                            ? "secondary"
                            : log.bounce_type === "ooo"
                              ? "outline"
                              : "secondary"
                      }
                      className="text-xs"
                    >
                      {log.bounce_type}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {log.recipient_email}
                  </td>
                  <td className="px-4 py-2 text-xs max-w-[200px] truncate">
                    {log.raw_subject || "—"}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <Badge variant="outline" className="text-xs">
                      {log.classification}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-xs">{log.action_taken}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {log.created_at
                      ? new Date(log.created_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {(log.action_taken === "marked_bounced" ||
                      log.action_taken === "marked_risky") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleResetStatus(log.recipient_email)}
                      >
                        Reset
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
  );
}
