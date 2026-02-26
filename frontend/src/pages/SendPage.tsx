import { useEffect, useState, useCallback } from "react";
import {
  getCampaigns,
  sendEmails,
  getJobStatus,
  scheduleEmails,
  scheduleRecurring,
  getConsentStatus,
  bulkUpdateCampaigns,
} from "@/api/client";
import type { Campaign } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import {
  Send,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  Repeat,
  Globe,
  ShieldAlert,
  AlertTriangle,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

type ScheduleMode = "none" | "one-time" | "recurring";

// Common IANA timezones for the dropdown
const TIMEZONE_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function detectTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TIMEZONE_OPTIONS.includes(tz) ? tz : "UTC";
  } catch {
    return "UTC";
  }
}

const DAY_OPTIONS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

export default function SendPage() {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<{
    status: string;
    total: number;
    sent: number;
    failed: number;
    errors: string[];
  } | null>(null);
  const [filter, setFilter] = useState<"pending" | "failed" | "all">("pending");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [consentOk, setConsentOk] = useState<boolean | null>(null);
  const [failedRows, setFailedRows] = useState<Campaign[]>([]);
  const [retrying, setRetrying] = useState(false);

  // --- scheduling state ---
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("none");
  const [runAt, setRunAt] = useState("");
  const [timezone, setTimezone] = useState(detectTimezone);
  const [cronHour, setCronHour] = useState("9");
  const [cronMinute, setCronMinute] = useState("0");
  const [cronDays, setCronDays] = useState<string[]>([
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
  ]);

  const load = useCallback(async () => {
    const params: Record<string, string | number> = { per_page: 500 };
    if (filter === "pending") params.sent_status = "pending";
    if (filter === "failed") params.sent_status = "failed";
    const { items } = await getCampaigns(params);
    setRows(items);
  }, [filter]);

  // Always load failed count
  const loadFailed = useCallback(async () => {
    const { items } = await getCampaigns({
      sent_status: "failed",
      per_page: 500,
    });
    setFailedRows(items);
  }, []);

  useEffect(() => {
    load();
    loadFailed();
  }, [load, loadFailed]);

  // Check consent status
  useEffect(() => {
    getConsentStatus()
      .then((s) => setConsentOk(s.all_accepted))
      .catch(() => setConsentOk(false));
  }, []);

  // Poll job status
  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(async () => {
      try {
        const status = await getJobStatus(jobId);
        setJobStatus(status);
        if (status.status === "completed" || status.status === "error") {
          clearInterval(interval);
          load();
          loadFailed();
        }
      } catch {
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobId, load]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const selectAllFailed = () => {
    setSelectedIds(new Set(failedRows.map((r) => r.id)));
    // Switch to failed view so user can see them
    if (filter !== "failed" && filter !== "all") setFilter("failed");
  };

  const retryFailed = async (ids?: string[]) => {
    const targetIds = ids ?? Array.from(selectedIds);
    if (targetIds.length === 0) {
      toast.error("No failed emails selected");
      return;
    }
    setRetrying(true);
    try {
      // Reset status to pending
      await bulkUpdateCampaigns(
        targetIds.map((id) => ({ id, sent_status: "pending" })),
      );
      toast.success(`Reset ${targetIds.length} email(s) to pending`);
      setSelectedIds(new Set());
      await Promise.all([load(), loadFailed()]);
    } catch {
      toast.error("Failed to reset emails");
    } finally {
      setRetrying(false);
    }
  };

  const retryAndSend = async (ids?: string[]) => {
    const targetIds = ids ?? Array.from(selectedIds);
    if (targetIds.length === 0) {
      toast.error("No failed emails selected");
      return;
    }
    setRetrying(true);
    try {
      // Reset status to pending
      await bulkUpdateCampaigns(
        targetIds.map((id) => ({ id, sent_status: "pending" })),
      );
      // Then send immediately
      const result = await sendEmails(targetIds);
      setJobId(result.job_id);
      setJobStatus({
        status: "queued",
        total: targetIds.length,
        sent: 0,
        failed: 0,
        errors: [],
      });
      setSelectedIds(new Set());
      toast.success(`Retrying ${targetIds.length} email(s)`);
    } catch {
      toast.error("Failed to retry emails");
    } finally {
      setRetrying(false);
    }
  };

  const toggleDay = (day: string) => {
    setCronDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const doSend = async () => {
    try {
      const result = await sendEmails(Array.from(selectedIds));
      setJobId(result.job_id);
      setJobStatus({
        status: "queued",
        total: selectedIds.size,
        sent: 0,
        failed: 0,
        errors: [],
      });
      toast.success("Send job started");
    } catch {
      toast.error("Failed to start send job");
    }
  };

  const handleSchedule = async () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one row first");
      return;
    }
    const ids = Array.from(selectedIds);

    try {
      if (scheduleMode === "one-time") {
        if (!runAt) {
          toast.error("Pick a date/time first");
          return;
        }
        // Send the raw datetime-local value + timezone; backend converts to UTC
        const result = await scheduleEmails(ids, runAt, timezone);
        toast.success(
          `Scheduled ${ids.length} email(s) for ${new Date(result.run_at).toLocaleString()}`,
        );
      } else if (scheduleMode === "recurring") {
        if (cronDays.length === 0) {
          toast.error("Select at least one day");
          return;
        }
        const cron = {
          hour: parseInt(cronHour),
          minute: parseInt(cronMinute),
          day_of_week: cronDays.join(","),
        };
        const result = await scheduleRecurring(ids, cron, timezone);
        toast.success(`Recurring schedule created (job ${result.job_id})`);
      }
      load();
    } catch {
      toast.error("Failed to schedule emails");
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<
      string,
      {
        icon: React.ReactNode;
        variant: "default" | "secondary" | "destructive" | "outline";
      }
    > = {
      sent: { icon: <CheckCircle size={12} />, variant: "default" },
      failed: { icon: <XCircle size={12} />, variant: "destructive" },
      response: { icon: <CheckCircle size={12} />, variant: "secondary" },
    };
    const entry = map[s] ?? {
      icon: <Clock size={12} />,
      variant: "outline" as const,
    };
    return (
      <Badge variant={entry.variant} className="gap-1 capitalize text-xs">
        {entry.icon} {s}
      </Badge>
    );
  };

  const jobProgress =
    jobStatus && jobStatus.total > 0
      ? Math.round(
          ((jobStatus.sent + jobStatus.failed) / jobStatus.total) * 100,
        )
      : 0;

  return (
    <div className="space-y-4">
      {/* Consent banner */}
      {consentOk === false && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="flex items-center gap-3 pt-6 pb-4">
            <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="text-sm">
              <span className="font-medium text-amber-700 dark:text-amber-400">
                You must accept all required policies before sending or
                scheduling emails.
              </span>{" "}
              <Link
                to="/consent"
                className="text-primary hover:underline font-medium"
              >
                Go to Consent Settings &rarr;
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Send Emails</h2>
        <div className="flex flex-wrap gap-2">
          <select
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as "pending" | "failed" | "all")
            }
            className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="pending">Pending only</option>
            <option value="failed">Failed only</option>
            <option value="all">All rows</option>
          </select>
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={
              selectedIds.size === 0 ||
              jobStatus?.status === "running" ||
              consentOk !== true
            }
          >
            <Send size={14} /> Send Now ({selectedIds.size})
          </Button>
        </div>
      </div>

      {/* Send Confirmation Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Send</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to send <strong>{selectedIds.size}</strong> email(s)
              immediately. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                doSend();
              }}
            >
              Send Now
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Schedule Panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar size={16} className="text-primary" /> Schedule Send
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-start gap-4">
            {/* Mode selector */}
            <div className="flex gap-1">
              {(["none", "one-time", "recurring"] as ScheduleMode[]).map(
                (m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={scheduleMode === m ? "default" : "outline"}
                    onClick={() => setScheduleMode(m)}
                  >
                    {m === "none"
                      ? "Off"
                      : m === "one-time"
                        ? "One-time"
                        : "Recurring"}
                  </Button>
                ),
              )}
            </div>

            {/* One-time picker */}
            {scheduleMode === "one-time" && (
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  type="datetime-local"
                  value={runAt}
                  onChange={(e) => setRunAt(e.target.value)}
                  className="w-auto"
                />
                <div className="flex items-center gap-1.5">
                  <Globe size={14} className="text-muted-foreground" />
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  size="sm"
                  onClick={handleSchedule}
                  disabled={selectedIds.size === 0 || consentOk !== true}
                >
                  <Calendar size={14} /> Schedule ({selectedIds.size})
                </Button>
              </div>
            )}

            {/* Recurring picker */}
            {scheduleMode === "recurring" && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">At</span>
                  <select
                    value={cronHour}
                    onChange={(e) => setCronHour(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                  <span>:</span>
                  <select
                    value={cronMinute}
                    onChange={(e) => setCronMinute(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {[0, 15, 30, 45].map((m) => (
                      <option key={m} value={m}>
                        {String(m).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                  <span className="text-muted-foreground">on</span>
                </div>
                <div className="flex gap-1">
                  {DAY_OPTIONS.map(({ value, label }) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={cronDays.includes(value) ? "default" : "outline"}
                      className="px-2 h-7 text-xs"
                      onClick={() => toggleDay(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <Globe size={14} className="text-muted-foreground" />
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  size="sm"
                  onClick={handleSchedule}
                  disabled={selectedIds.size === 0 || consentOk !== true}
                >
                  <Repeat size={14} /> Schedule ({selectedIds.size})
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Job status card */}
      {jobStatus && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-4 mb-3">
              <h3 className="text-sm font-semibold">
                Send Job:{" "}
                <Badge variant="outline" className="ml-1 capitalize">
                  {jobStatus.status}
                </Badge>
              </h3>
              {jobStatus.status === "running" && (
                <RefreshCw size={16} className="text-primary animate-spin" />
              )}
            </div>
            <div className="flex gap-6 text-sm mb-3">
              <span className="text-muted-foreground">
                Total: <b className="text-foreground">{jobStatus.total}</b>
              </span>
              <span className="text-green-600">
                Sent: <b>{jobStatus.sent}</b>
              </span>
              <span className="text-destructive">
                Failed: <b>{jobStatus.failed}</b>
              </span>
            </div>
            {jobStatus.status === "running" && (
              <Progress value={jobProgress} className="h-2" />
            )}
            {jobStatus.errors.length > 0 && (
              <div className="mt-3 bg-destructive/10 rounded-lg p-3">
                <p className="text-xs font-medium text-destructive mb-1">
                  Errors:
                </p>
                {jobStatus.errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive">
                    {e}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Failed emails card */}
      {failedRows.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle size={16} />
              Failed Emails ({failedRows.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Button size="sm" variant="outline" onClick={selectAllFailed}>
                Select All Failed ({failedRows.length})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => retryFailed(failedRows.map((r) => r.id))}
                disabled={retrying}
              >
                {retrying ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RotateCcw size={14} />
                )}
                Reset to Pending
              </Button>
              <Button
                size="sm"
                onClick={() => retryAndSend(failedRows.map((r) => r.id))}
                disabled={retrying || consentOk !== true}
              >
                {retrying ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                Retry &amp; Send All ({failedRows.length})
              </Button>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={
                          failedRows.length > 0 &&
                          failedRows.every((r) => selectedIds.has(r.id))
                        }
                        onChange={() => {
                          const allSelected = failedRows.every((r) =>
                            selectedIds.has(r.id),
                          );
                          if (allSelected) {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              failedRows.forEach((r) => next.delete(r.id));
                              return next;
                            });
                          } else {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              failedRows.forEach((r) => next.add(r.id));
                              return next;
                            });
                          }
                        }}
                        className="rounded"
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Sender</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failedRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          className="rounded"
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {r.recipient_name}
                      </TableCell>
                      <TableCell>{r.recipient_email}</TableCell>
                      <TableCell>{r.company}</TableCell>
                      <TableCell>{r.sender_email}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => retryAndSend([r.id])}
                          disabled={retrying || consentOk !== true}
                        >
                          <RotateCcw size={12} /> Retry
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email rows table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={
                      rows.length > 0 && selectedIds.size === rows.length
                    }
                    onChange={selectAll}
                    className="rounded"
                  />
                </TableHead>
                {[
                  "Status",
                  "Name",
                  "Email",
                  "Company",
                  "Position",
                  "Template",
                  "Sender",
                  "Scheduled At",
                ].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No emails to display.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell>{statusBadge(r.sent_status)}</TableCell>
                    <TableCell className="font-medium">
                      {r.recipient_name}
                    </TableCell>
                    <TableCell>{r.recipient_email}</TableCell>
                    <TableCell>{r.company}</TableCell>
                    <TableCell>{r.position}</TableCell>
                    <TableCell>{r.template_file}</TableCell>
                    <TableCell>{r.sender_email}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.scheduled_at
                        ? new Date(
                            r.scheduled_at.endsWith("Z")
                              ? r.scheduled_at
                              : r.scheduled_at + "Z",
                          ).toLocaleString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
