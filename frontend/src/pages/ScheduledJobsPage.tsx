import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getScheduledJobs, cancelScheduledJob, rerunJob } from "@/api/client";
import { usePageTitle } from "@/hooks/usePageTitle";
import type { ScheduledJob, FinishedJob } from "@/api/client";
import { useJobSSE } from "@/hooks/useJobSSE";
import type { JobUpdateEvent } from "@/hooks/useJobSSE";
import StatusDot from "@/components/StatusDot";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventInput, EventClickArg } from "@fullcalendar/core";

import {
  Calendar as CalendarIcon,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  RotateCcw,
  AlertTriangle,
  FilterX,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
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
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_COLORS: Record<string, string> = {
  queued: "oklch(0.65 0.15 250)",
  scheduled: "oklch(0.7 0.15 80)",
  running: "oklch(0.65 0.2 145)",
  completed: "oklch(0.6 0.18 145)",
  error: "oklch(0.55 0.22 27)",
  stale: "oklch(0.65 0.2 55)",
  cancelled: "oklch(0.55 0.02 250)",
};

const ALL_STATUSES = [
  "queued",
  "scheduled",
  "running",
  "completed",
  "error",
  "stale",
  "cancelled",
] as const;

const statusVariant = (
  status: string,
): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "completed":
      return "default";
    case "error":
    case "stale":
      return "destructive";
    case "cancelled":
      return "outline";
    default:
      return "secondary";
  }
};

export default function ScheduledJobsPage() {
  usePageTitle("Scheduled Jobs");
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [finished, setFinished] = useState<FinishedJob[]>([]);
  const [showFinished, setShowFinished] = useState(true);
  const [loading, setLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [rerunningId, setRerunningId] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    () => new Set(ALL_STATUSES),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getScheduledJobs();
      setJobs(data.jobs);
      setFinished(data.finished);
    } catch {
      toast.error("Failed to load scheduled jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // SSE: live updates replace polling
  const hasRunning = jobs.some((j) => j.status === "running");

  const handleJobUpdate = useCallback((data: JobUpdateEvent) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.job_id === data.job_id
          ? { ...j, status: data.status, sent: data.sent, failed: data.failed }
          : j,
      ),
    );
  }, []);

  const handleJobFinished = useCallback(
    (data: JobUpdateEvent) => {
      handleJobUpdate(data);
      // Reload to move finished jobs between lists
      setTimeout(() => load(), 500);
    },
    [handleJobUpdate, load],
  );

  useJobSSE({
    enabled: hasRunning,
    onJobUpdate: handleJobUpdate,
    onJobFinished: handleJobFinished,
  });

  const confirmCancel = async () => {
    if (cancelTarget === null) return;
    try {
      await cancelScheduledJob(cancelTarget);
      toast.success("Job cancelled");
      load();
    } catch {
      toast.error("Failed to cancel job");
    } finally {
      setCancelTarget(null);
    }
  };

  const handleRerun = async (jobId: string) => {
    setRerunningId(jobId);
    try {
      const result = await rerunJob(jobId);
      toast.success(`Rerun started — new job ${result.job_id.slice(0, 8)}…`);
      navigate(`/scheduled-jobs/${result.job_id}`);
    } catch {
      toast.error("Failed to rerun job");
    } finally {
      setRerunningId(null);
    }
  };

  const toggleFilter = useCallback((status: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setActiveFilters(new Set(ALL_STATUSES));
  }, []);

  const allFiltersActive = activeFilters.size === ALL_STATUSES.length;

  // Calendar events from all jobs (filtered)
  const calendarEvents: EventInput[] = useMemo(() => {
    const allJobs = [...jobs, ...finished];
    return allJobs
      .filter((job) => activeFilters.has(job.status))
      .map((job) => ({
        id: job.job_id,
        title: `${job.name} (${job.sent}/${job.total})`,
        start: job.scheduled_at ?? job.created_at ?? undefined,
        backgroundColor: STATUS_COLORS[job.status] ?? STATUS_COLORS.queued,
        borderColor: STATUS_COLORS[job.status] ?? STATUS_COLORS.queued,
        extendedProps: { status: job.status, job },
      }));
  }, [jobs, finished, activeFilters]);

  const handleEventClick = (info: EventClickArg) => {
    navigate(`/scheduled-jobs/${info.event.id}`);
  };

  // Filtered lists for tables
  const filteredJobs = useMemo(
    () => jobs.filter((j) => activeFilters.has(j.status)),
    [jobs, activeFilters],
  );
  const filteredFinished = useMemo(
    () => finished.filter((j) => activeFilters.has(j.status)),
    [finished, activeFilters],
  );

  // Stats (always unfiltered)
  const runningCount = jobs.filter((j) => j.status === "running").length;
  const scheduledCount = jobs.filter(
    (j) => j.status === "queued" || j.status === "scheduled",
  ).length;
  const staleCount = finished.filter((j) => j.status === "stale").length;
  const failedJobCount = finished.filter(
    (j) => j.status === "error" || j.status === "stale",
  ).length;

  return (
    <div className="space-y-6">
      {/* Stale/Failed Jobs Warning Banner */}
      {failedJobCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 dark:border-orange-800 dark:bg-orange-950/30">
          <AlertTriangle size={18} className="text-orange-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
              {failedJobCount} scheduled job{failedJobCount !== 1 ? "s" : ""}{" "}
              {staleCount > 0
                ? `failed to execute (${staleCount} stale)`
                : "encountered errors"}
            </p>
            <p className="text-xs text-orange-600 dark:text-orange-400">
              Review and rerun from the Finished Jobs section below.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-orange-400 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300"
            onClick={() => setShowFinished(true)}
          >
            Review
          </Button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarIcon size={22} className="text-primary" /> Scheduled &
            Active Jobs
          </h2>
          <p className="text-sm text-muted-foreground">
            {runningCount > 0 && (
              <span className="text-green-600 font-medium mr-2">
                {runningCount} running
              </span>
            )}
            {scheduledCount > 0 && (
              <span className="mr-2">{scheduledCount} scheduled</span>
            )}
            {finished.length > 0 && <span>{finished.length} finished</span>}
            {runningCount === 0 &&
              scheduledCount === 0 &&
              finished.length === 0 && (
                <span>No jobs yet. Use the Send page to create one.</span>
              )}
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw
            size={16}
            className={`mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Status Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Filter:</span>
        {ALL_STATUSES.map((status) => {
          const count = [...jobs, ...finished].filter(
            (j) => j.status === status,
          ).length;
          const active = activeFilters.has(status);
          return (
            <button
              key={status}
              onClick={() => toggleFilter(status)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium capitalize transition-all border ${
                active
                  ? "opacity-100 shadow-sm"
                  : "opacity-40 bg-muted border-transparent"
              }`}
              style={
                active
                  ? {
                      backgroundColor: STATUS_COLORS[status] + "22",
                      borderColor: STATUS_COLORS[status],
                      color: STATUS_COLORS[status],
                    }
                  : undefined
              }
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[status] }}
              />
              {status}
              <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
        {!allFiltersActive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs text-muted-foreground px-2"
            onClick={resetFilters}
          >
            <FilterX size={12} />
            Reset
          </Button>
        )}
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className="pt-6 fc-themed">
          <FullCalendar
            plugins={[
              dayGridPlugin,
              timeGridPlugin,
              listPlugin,
              interactionPlugin,
            ]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
            }}
            events={calendarEvents}
            eventClick={handleEventClick}
            height="auto"
            eventDisplay="block"
            dayMaxEvents={3}
            nowIndicator
          />
        </CardContent>
      </Card>

      {/* Active Jobs Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Active Jobs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && jobs.length === 0 ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground text-sm">
              {jobs.length === 0
                ? "No active jobs. Use the Send page to create one."
                : "No active jobs match the current filter."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-5" />
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map((job) => {
                  const pct =
                    job.total > 0
                      ? ((job.sent + job.failed) / job.total) * 100
                      : 0;
                  return (
                    <TableRow
                      key={job.job_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/scheduled-jobs/${job.job_id}`)}
                    >
                      <TableCell>
                        <StatusDot status={job.status} />
                      </TableCell>
                      <TableCell className="font-medium">
                        {job.name}
                        <span className="block text-xs text-muted-foreground font-mono">
                          {job.job_id.slice(0, 8)}…
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusVariant(job.status)}
                          className="capitalize"
                        >
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-40">
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="h-1.5 flex-1" />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            <span className="text-green-600 font-medium">
                              {job.sent}
                            </span>
                            /
                            <span className="text-destructive font-medium">
                              {job.failed}
                            </span>
                            /{job.total}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {job.created_at
                          ? new Date(job.created_at).toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {job.scheduled_at
                          ? new Date(job.scheduled_at).toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {(job.status === "queued" ||
                            job.status === "scheduled") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setCancelTarget(job.job_id)}
                              title="Cancel job"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 size={15} />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              navigate(`/scheduled-jobs/${job.job_id}`)
                            }
                            title="View details"
                          >
                            <ArrowUpRight size={15} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Finished Jobs */}
      {finished.length > 0 && (
        <div className="space-y-2">
          <button
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowFinished((v) => !v)}
          >
            {showFinished ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
            Finished Jobs ({filteredFinished.length}
            {filteredFinished.length !== finished.length
              ? ` of ${finished.length}`
              : ""})
          </button>
          {showFinished && filteredFinished.length === 0 ? (
            <Card>
              <CardContent className="px-6 py-8 text-center text-muted-foreground text-sm">
                No finished jobs match the current filter.
              </CardContent>
            </Card>
          ) : showFinished && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-5" />
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFinished.map((job) => {
                      const pct =
                        job.total > 0
                          ? ((job.sent + job.failed) / job.total) * 100
                          : 0;
                      const canRerun =
                        job.status === "stale" ||
                        job.status === "error" ||
                        (job.status === "completed" && job.failed > 0);
                      const canDismiss =
                        job.status === "error" || job.status === "stale";
                      return (
                        <TableRow
                          key={job.job_id}
                          className={`cursor-pointer hover:bg-muted/50 ${
                            job.status === "stale"
                              ? "bg-orange-50/50 dark:bg-orange-950/10"
                              : ""
                          }`}
                          onClick={() =>
                            navigate(`/scheduled-jobs/${job.job_id}`)
                          }
                        >
                          <TableCell>
                            <StatusDot status={job.status} />
                          </TableCell>
                          <TableCell className="font-medium">
                            {job.name}
                            <span className="block text-xs text-muted-foreground font-mono">
                              {job.job_id.slice(0, 8)}…
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={statusVariant(job.status)}
                              className="capitalize"
                            >
                              {job.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="min-w-40">
                            <div className="flex items-center gap-2">
                              <Progress value={pct} className="h-1.5 flex-1" />
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                <span className="text-green-600 font-medium">
                                  {job.sent}
                                </span>
                                /
                                <span className="text-destructive font-medium">
                                  {job.failed}
                                </span>
                                /{job.total}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {job.completed_at
                              ? new Date(job.completed_at).toLocaleString()
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div
                              className="flex items-center justify-end gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {canRerun && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1.5 text-xs"
                                  disabled={rerunningId === job.job_id}
                                  onClick={() => handleRerun(job.job_id)}
                                >
                                  <RotateCcw
                                    size={12}
                                    className={
                                      rerunningId === job.job_id
                                        ? "animate-spin"
                                        : ""
                                    }
                                  />
                                  Rerun
                                </Button>
                              )}
                              {canDismiss && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
                                  onClick={() => setCancelTarget(job.job_id)}
                                >
                                  <Trash2 size={12} />
                                  Dismiss
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  navigate(`/scheduled-jobs/${job.job_id}`)
                                }
                                title="View details"
                              >
                                <ArrowUpRight size={15} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Cancel Confirmation */}
      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(o) => !o && setCancelTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {(() => {
                const t = [...jobs, ...finished].find(
                  (j) => j.job_id === cancelTarget,
                );
                return t?.status === "error" || t?.status === "stale"
                  ? "Dismiss Job"
                  : "Cancel Job";
              })()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const t = [...jobs, ...finished].find(
                  (j) => j.job_id === cancelTarget,
                );
                return t?.status === "error" || t?.status === "stale"
                  ? "This will mark the job as cancelled so it no longer appears as an active error."
                  : "Are you sure you want to cancel this scheduled job? This action cannot be undone.";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
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
