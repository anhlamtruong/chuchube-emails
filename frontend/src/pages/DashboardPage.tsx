import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getDashboard,
  rerunJob,
  cancelScheduledJob,
  extractApiError,
} from "@/api/client";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useJobSSE } from "@/hooks/useJobSSE";
import type { JobUpdateEvent } from "@/hooks/useJobSSE";
import StatusDot from "@/components/StatusDot";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import {
  Users,
  Table,
  Send,
  Clock,
  Plus,
  Upload,
  Calendar,
  ArrowUpRight,
  AlertTriangle,
  MessageSquare,
  MessageSquareWarning,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

interface UpcomingJob {
  job_id: string;
  status: string;
  total: number;
  sent: number;
  created_at: string | null;
}

interface StaleJob {
  job_id: string;
  name: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  created_at: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
}

interface DashboardData {
  total_recruiters: number;
  total_campaigns: number;
  by_status: Record<string, number>;
  upcoming_jobs?: UpcomingJob[];
  stale_job_count?: number;
  stale_jobs?: StaleJob[];
  threads_with_replies?: number;
  threads_needing_followup?: number;
}

export default function DashboardPage() {
  usePageTitle("Dashboard");
  const [data, setData] = useState<DashboardData | null>(null);
  const [staleExpanded, setStaleExpanded] = useState(false);
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  const [dismissTarget, setDismissTarget] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    getDashboard()
      .then(setData)
      .catch(() => toast.error("Failed to load dashboard"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Notify about stale jobs once when data loads
  useEffect(() => {
    if (data && (data.stale_job_count ?? 0) > 0) {
      toast.warning(
        `${data.stale_job_count} stale job${data.stale_job_count! > 1 ? "s" : ""} need attention`,
        { id: "stale-jobs", duration: 8000 },
      );
    }
  }, [data?.stale_job_count]);

  const handleStaleRerun = async (jobId: string) => {
    setRerunningId(jobId);
    try {
      const result = await rerunJob(jobId);
      toast.success(`Rerun started — new job ${result.job_id.slice(0, 8)}…`);
      navigate(`/scheduled-jobs/${result.job_id}`);
    } catch (err) {
      toast.error(extractApiError(err, "Failed to rerun job"));
    } finally {
      setRerunningId(null);
    }
  };

  const confirmDismiss = async () => {
    if (!dismissTarget) return;
    try {
      await cancelScheduledJob(dismissTarget);
      toast.success("Job dismissed");
      load();
    } catch {
      toast.error("Failed to dismiss job");
    } finally {
      setDismissTarget(null);
    }
  };

  // SSE: live job updates on dashboard
  const hasActive = (data?.upcoming_jobs ?? []).some((j) =>
    ["running", "queued", "scheduled"].includes(j.status),
  );

  const handleJobUpdate = useCallback((evt: JobUpdateEvent) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        upcoming_jobs: (prev.upcoming_jobs ?? []).map((j) =>
          j.job_id === evt.job_id
            ? { ...j, status: evt.status, sent: evt.sent }
            : j,
        ),
      };
    });
  }, []);

  const handleJobFinished = useCallback(
    (evt: JobUpdateEvent) => {
      handleJobUpdate(evt);
      // Reload dashboard to get updated stats
      setTimeout(load, 500);
    },
    [handleJobUpdate, load],
  );

  useJobSSE({
    enabled: hasActive,
    onJobUpdate: handleJobUpdate,
    onJobFinished: handleJobFinished,
  });

  if (!data) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const cards = [
    {
      label: "Total Recruiters",
      value: data.total_recruiters,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Total Campaigns",
      value: data.total_campaigns,
      icon: Table,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      label: "Sent",
      value: data.by_status?.sent ?? 0,
      icon: Send,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "Pending",
      value: data.by_status?.pending ?? 0,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Replies",
      value: data.threads_with_replies ?? 0,
      icon: MessageSquare,
      color: "text-teal-600",
      bg: "bg-teal-50",
    },
    {
      label: "Need Follow-up",
      value: data.threads_needing_followup ?? 0,
      icon: MessageSquareWarning,
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => navigate("/send")}>
            <Send size={14} /> Send Emails
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/campaigns")}
          >
            <Plus size={14} /> New Campaign
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/recruiters")}
          >
            <Upload size={14} /> Import
          </Button>
        </div>
      </div>

      {/* Stale Jobs Alert — expandable */}
      {(data.stale_job_count ?? 0) > 0 && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/30 overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-950/50 transition-colors"
            onClick={() => setStaleExpanded((v) => !v)}
          >
            <div className="flex items-center gap-3">
              <AlertTriangle size={18} className="text-orange-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
                  {data.stale_job_count} stale job
                  {data.stale_job_count! > 1 ? "s" : ""} need attention
                </p>
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  Click to expand and review.
                  <span
                    className="ml-2 underline hover:no-underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate("/scheduled-jobs");
                    }}
                  >
                    View all →
                  </span>
                </p>
              </div>
            </div>
            {staleExpanded ? (
              <ChevronDown size={16} className="text-orange-600 shrink-0" />
            ) : (
              <ChevronRight size={16} className="text-orange-600 shrink-0" />
            )}
          </div>

          {staleExpanded && (data.stale_jobs ?? []).length > 0 && (
            <div className="border-t border-orange-200 dark:border-orange-800">
              <div className="divide-y divide-orange-200 dark:divide-orange-800">
                {data.stale_jobs!.map((job) => (
                  <div
                    key={job.job_id}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-orange-100/50 dark:hover:bg-orange-950/40 transition-colors"
                  >
                    <div
                      className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                      onClick={() => navigate(`/scheduled-jobs/${job.job_id}`)}
                    >
                      <StatusDot status={job.status} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate text-orange-900 dark:text-orange-200">
                          {job.name}
                        </p>
                        <p className="text-xs text-orange-600 dark:text-orange-400">
                          {(() => {
                            const raw = job.scheduled_at || job.created_at;
                            if (!raw) return "—";
                            const d = new Date(raw);
                            return Number.isNaN(d.getTime())
                              ? raw
                              : d.toLocaleString();
                          })()}
                          <span className="ml-2">
                            {job.sent}/{job.total} sent
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 text-xs border-orange-400 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300"
                        disabled={rerunningId === job.job_id}
                        onClick={() => handleStaleRerun(job.job_id)}
                      >
                        <RotateCcw
                          size={12}
                          className={
                            rerunningId === job.job_id ? "animate-spin" : ""
                          }
                        />
                        Rerun
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
                        onClick={() => setDismissTarget(job.job_id)}
                      >
                        <Trash2 size={12} />
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dismiss Confirmation */}
      <AlertDialog
        open={dismissTarget !== null}
        onOpenChange={(o) => !o && setDismissTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss Stale Job</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the job as cancelled so it no longer appears as
              stale. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDismissTarget(null)}>
              Keep
            </Button>
            <Button variant="destructive" onClick={confirmDismiss}>
              Dismiss
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <div className={`p-2 rounded-lg ${bg}`}>
                <Icon size={18} className={color} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status Breakdown */}
        {Object.keys(data.by_status ?? {}).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.by_status).map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg"
                  >
                    <span className="text-sm font-medium capitalize">
                      {status}
                    </span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upcoming Scheduled Jobs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar size={16} /> Upcoming Jobs
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/scheduled-jobs")}
              className="text-xs"
            >
              View all <ArrowUpRight size={12} />
            </Button>
          </CardHeader>
          <CardContent>
            {(data.upcoming_jobs ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No scheduled jobs</p>
            ) : (
              <div className="space-y-2">
                {data.upcoming_jobs!.map((job) => {
                  const pct = job.total > 0 ? (job.sent / job.total) * 100 : 0;
                  return (
                    <div
                      key={job.job_id}
                      className="flex items-center justify-between p-2 bg-muted rounded-lg cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => navigate(`/scheduled-jobs/${job.job_id}`)}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <StatusDot status={job.status} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {job.total} email{job.total !== 1 ? "s" : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {job.created_at
                              ? new Date(job.created_at).toLocaleString()
                              : "—"}
                          </p>
                          {job.status === "running" && (
                            <Progress value={pct} className="h-1 mt-1" />
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="capitalize ml-2">
                        {job.status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
