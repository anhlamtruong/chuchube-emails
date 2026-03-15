import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getJobDetail,
  cancelScheduledJob,
  rerunJob,
  rescheduleJob,
  cloneJob,
} from "@/api/client";
import { usePageTitle } from "@/hooks/usePageTitle";
import type { JobDetail, JobEmail } from "@/api/client";
import { useJobSSE } from "@/hooks/useJobSSE";
import type { EmailUpdateEvent, JobUpdateEvent } from "@/hooks/useJobSSE";
import ProgressRing from "@/components/ProgressRing";
import StatusDot from "@/components/StatusDot";
import { formatDistanceToNow } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  RotateCcw,
  CalendarClock,
  AlertTriangle,
  Link2,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

type EmailFilter = "all" | "sent" | "failed" | "pending";

const statusVariant = (
  s: string,
): "default" | "secondary" | "destructive" | "outline" => {
  switch (s) {
    case "completed":
    case "sent":
      return "default";
    case "error":
    case "failed":
    case "stale":
      return "destructive";
    case "cancelled":
      return "outline";
    default:
      return "secondary";
  }
};

const emailStatusIcon = (s: string) => {
  switch (s) {
    case "sent":
      return <CheckCircle size={12} className="text-green-600" />;
    case "failed":
      return <XCircle size={12} className="text-destructive" />;
    default:
      return <Clock size={12} className="text-muted-foreground" />;
  }
};

export default function JobDetailPage() {
  const { id: jobId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  usePageTitle(jobId ? `Job ${jobId.slice(0, 8)}` : "Job Detail");

  // Navigate back using history if available, otherwise fall back to the jobs list
  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/scheduled-jobs");
    }
  };

  const [job, setJob] = useState<JobDetail | null>(null);
  const [emails, setEmails] = useState<JobEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<EmailFilter>("all");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTz, setRescheduleTz] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );

  // Track row animations: row_id → animation class
  const [animatingRows, setAnimatingRows] = useState<Map<string, string>>(
    new Map(),
  );
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const load = useCallback(async () => {
    if (!jobId) return;
    try {
      const data = await getJobDetail(jobId);
      setJob(data);
      setEmails(data.emails);
    } catch {
      toast.error("Failed to load job details");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  // SSE: real-time updates
  const isTerminal = job
    ? ["completed", "error", "cancelled", "stale"].includes(job.status)
    : false;

  const handleJobUpdate = useCallback((data: JobUpdateEvent) => {
    setJob((prev) =>
      prev
        ? { ...prev, status: data.status, sent: data.sent, failed: data.failed }
        : prev,
    );
  }, []);

  const handleEmailUpdate = useCallback((data: EmailUpdateEvent) => {
    setEmails((prev) =>
      prev.map((e) =>
        e.id === data.row_id
          ? { ...e, sent_status: data.sent_status, sent_at: data.sent_at }
          : e,
      ),
    );

    // Trigger row animation
    const animClass =
      data.sent_status === "sent" ? "animate-row-sent" : "animate-row-failed";
    setAnimatingRows((prev) => {
      const next = new Map(prev);
      next.set(data.row_id, animClass);
      return next;
    });

    // Clear animation after 1.2s
    const existing = timeoutsRef.current.get(data.row_id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      setAnimatingRows((prev) => {
        const next = new Map(prev);
        next.delete(data.row_id);
        return next;
      });
      timeoutsRef.current.delete(data.row_id);
    }, 1200);
    timeoutsRef.current.set(data.row_id, t);
  }, []);

  const handleJobFinished = useCallback((data: JobUpdateEvent) => {
    setJob((prev) =>
      prev
        ? {
            ...prev,
            status: data.status,
            sent: data.sent,
            failed: data.failed,
            completed_at: data.completed_at ?? null,
          }
        : prev,
    );
    if (data.status === "completed") {
      toast.success(`Job completed: ${data.sent} sent, ${data.failed} failed`);
    } else {
      toast.error("Job finished with errors");
    }
  }, []);

  useJobSSE({
    jobId,
    enabled: !!jobId && !isTerminal && !loading,
    onJobUpdate: handleJobUpdate,
    onEmailUpdate: handleEmailUpdate,
    onJobFinished: handleJobFinished,
  });

  // Cleanup timeouts on unmount
  useEffect(
    () => () => {
      timeoutsRef.current.forEach((t) => clearTimeout(t));
    },
    [],
  );

  const confirmCancel = async () => {
    if (!jobId) return;
    try {
      await cancelScheduledJob(jobId);
      toast.success("Job cancelled");
      load();
    } catch {
      toast.error("Failed to cancel job");
    } finally {
      setCancelOpen(false);
    }
  };

  const handleRerun = async () => {
    if (!jobId) return;
    setRerunning(true);
    try {
      const result = await rerunJob(jobId);
      toast.success(`Rerun started — new job ${result.job_id.slice(0, 8)}…`);
      navigate(`/scheduled-jobs/${result.job_id}`);
    } catch {
      toast.error("Failed to rerun job");
    } finally {
      setRerunning(false);
    }
  };

  const handleClone = async () => {
    if (!jobId) return;
    setCloning(true);
    try {
      const result = await cloneJob(jobId);
      toast.success(
        `Cloned ${result.total} emails — new job ${result.job_id.slice(0, 8)}…`,
      );
      navigate(`/scheduled-jobs/${result.job_id}`);
    } catch {
      toast.error("Failed to clone job");
    } finally {
      setCloning(false);
    }
  };

  const handleReschedule = async () => {
    if (!jobId || !rescheduleDate) return;
    try {
      const result = await rescheduleJob(jobId, rescheduleDate, rescheduleTz);
      toast.success(
        `Rescheduled — new job ${result.job_id.slice(0, 8)}… at ${new Date(result.run_at).toLocaleString()}`,
      );
      navigate(`/scheduled-jobs/${result.job_id}`);
    } catch {
      toast.error("Failed to reschedule job");
    } finally {
      setShowReschedule(false);
    }
  };

  // Computed
  const progress =
    job && job.total > 0 ? ((job.sent + job.failed) / job.total) * 100 : 0;

  const remaining = job ? job.total - job.sent - job.failed : 0;

  const canRerun = job
    ? job.status === "stale" ||
      job.status === "error" ||
      (job.status === "completed" && job.failed > 0) ||
      job.status === "cancelled"
    : false;

  // Clone & Send All / Reschedule are available on ANY terminal job
  const canCloneOrReschedule = job
    ? ["completed", "error", "stale", "cancelled"].includes(job.status)
    : false;

  const filteredEmails =
    filter === "all" ? emails : emails.filter((e) => e.sent_status === filter);

  const sentCount = emails.filter((e) => e.sent_status === "sent").length;
  const failedCount = emails.filter((e) => e.sent_status === "failed").length;
  const pendingCount = emails.filter((e) => e.sent_status === "pending").length;

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft size={14} /> Back to Jobs
        </Button>
        <Card>
          <CardContent className="pt-6 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-8">
            <Skeleton className="h-30 w-30 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft size={14} /> Back to Jobs
        </Button>
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Job not found
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={goBack}>
        <ArrowLeft size={14} /> Back to Jobs
      </Button>

      {/* Stale Warning */}
      {job.status === "stale" && (
        <div className="flex items-center gap-3 rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/30 px-4 py-3 text-sm text-orange-800 dark:text-orange-300">
          <AlertTriangle size={18} className="shrink-0" />
          <div>
            <p className="font-medium">This job became stale</p>
            <p className="text-xs mt-0.5 opacity-80">
              The scheduled time passed but rows were no longer dispatchable.
              You can rerun the unsent rows or reschedule for a new time.
            </p>
          </div>
        </div>
      )}

      {/* Header Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-bold">
                  Send {job.total} email{job.total !== 1 ? "s" : ""}
                </h2>
                <Badge
                  variant={statusVariant(job.status)}
                  className="gap-1.5 capitalize"
                >
                  <StatusDot status={job.status} className="h-2 w-2" />
                  {job.status}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
                <span className="font-mono text-xs">
                  {job.job_id.slice(0, 8)}…
                </span>
                {job.owner_email && (
                  <Badge variant="outline" className="text-xs gap-1">
                    User: {job.owner_email}
                  </Badge>
                )}
                {job.created_at && (
                  <span>
                    Created{" "}
                    {formatDistanceToNow(new Date(job.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                )}
                {job.scheduled_at && (
                  <span>
                    Scheduled for {new Date(job.scheduled_at).toLocaleString()}
                  </span>
                )}
                {job.completed_at && (
                  <span>
                    {job.status === "completed" ? "Completed" : "Ended"}{" "}
                    {formatDistanceToNow(new Date(job.completed_at), {
                      addSuffix: true,
                    })}
                  </span>
                )}
                {job.parent_job_id && (
                  <button
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    onClick={() =>
                      navigate(`/scheduled-jobs/${job.parent_job_id}`)
                    }
                  >
                    <Link2 size={12} /> Rerun of {job.parent_job_id.slice(0, 8)}
                    …
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(job.status === "queued" || job.status === "scheduled") && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setCancelOpen(true)}
                >
                  <Trash2 size={14} /> Cancel Job
                </Button>
              )}
              {canRerun && (
                <Button size="sm" onClick={handleRerun} disabled={rerunning}>
                  <RotateCcw
                    size={14}
                    className={rerunning ? "animate-spin" : ""}
                  />
                  {rerunning ? "Rerunning…" : "Rerun Now"}
                </Button>
              )}
              {canCloneOrReschedule && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClone}
                    disabled={cloning}
                  >
                    <Copy size={14} />
                    {cloning ? "Cloning…" : "Clone & Send All"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowReschedule(!showReschedule)}
                  >
                    <CalendarClock size={14} /> Reschedule
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Inline Reschedule Form */}
          {showReschedule && (
            <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border bg-muted/50 p-4">
              <div className="space-y-1">
                <label className="text-xs font-medium">Date &amp; Time</label>
                <input
                  type="datetime-local"
                  className="block rounded-md border px-3 py-1.5 text-sm"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Timezone</label>
                <select
                  className="block rounded-md border px-3 py-1.5 text-sm"
                  value={rescheduleTz}
                  onChange={(e) => setRescheduleTz(e.target.value)}
                >
                  <option value="America/New_York">Eastern</option>
                  <option value="America/Chicago">Central</option>
                  <option value="America/Denver">Mountain</option>
                  <option value="America/Los_Angeles">Pacific</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <Button
                size="sm"
                onClick={handleReschedule}
                disabled={!rescheduleDate}
              >
                Confirm Reschedule
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowReschedule(false)}
              >
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Progress Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <ProgressRing
              value={progress}
              label={`${job.sent + job.failed}/${job.total}`}
              status={
                job.status === "error"
                  ? "error"
                  : isTerminal
                    ? "completed"
                    : "running"
              }
            />
            <div className="flex-1 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Sent</p>
                  <p className="text-lg font-bold text-green-600">{job.sent}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Failed</p>
                  <p className="text-lg font-bold text-destructive">
                    {job.failed}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className="text-lg font-bold text-muted-foreground">
                    {remaining}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-lg font-bold">{job.total}</p>
                </div>
              </div>
              {job.status === "running" && remaining > 0 && (
                <p className="text-xs text-muted-foreground">
                  Est. ~{remaining * 2}s remaining (2s per email)
                </p>
              )}
              <Progress value={progress} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base">Emails</CardTitle>
            <div className="flex gap-1">
              {(
                [
                  ["all", `All (${emails.length})`],
                  ["sent", `Sent (${sentCount})`],
                  ["failed", `Failed (${failedCount})`],
                  ["pending", `Pending (${pendingCount})`],
                ] as [EmailFilter, string][]
              ).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={filter === key ? "default" : "outline"}
                  onClick={() => setFilter(key)}
                  className="text-xs h-7 px-2.5"
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-125 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Sender</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmails.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No emails to display.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEmails.map((email) => (
                    <TableRow
                      key={email.id}
                      className={animatingRows.get(email.id) ?? ""}
                    >
                      <TableCell>
                        {emailStatusIcon(email.sent_status)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {email.recipient_name}
                      </TableCell>
                      <TableCell>{email.recipient_email}</TableCell>
                      <TableCell>{email.company}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {email.sender_email}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusVariant(email.sent_status)}
                          className="gap-1 capitalize text-xs"
                        >
                          {email.sent_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {email.sent_at
                          ? formatDistanceToNow(new Date(email.sent_at), {
                              addSuffix: true,
                            })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="px-4 py-2 text-xs text-muted-foreground border-t">
            Showing {filteredEmails.length} of {emails.length} emails
          </div>
        </CardContent>
      </Card>

      {/* Errors Card */}
      {job.errors.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive flex items-center gap-2">
              <XCircle size={16} /> Errors ({job.errors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-destructive/10 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
              {job.errors.map((err, i) => (
                <p key={i} className="text-xs text-destructive">
                  {err}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancel Confirmation */}
      <AlertDialog
        open={cancelOpen}
        onOpenChange={(o) => !o && setCancelOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this scheduled job? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep
            </Button>
            <Button variant="destructive" onClick={confirmCancel}>
              Cancel Job
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
