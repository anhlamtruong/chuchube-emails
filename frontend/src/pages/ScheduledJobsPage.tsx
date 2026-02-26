import { useEffect, useState, useCallback } from "react";
import { getScheduledJobs, cancelScheduledJob } from "@/api/client";
import type { ScheduledJob, FinishedJob } from "@/api/client";
import {
  Calendar,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

export default function ScheduledJobsPage() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [finished, setFinished] = useState<FinishedJob[]>([]);
  const [showFinished, setShowFinished] = useState(true);
  const [loading, setLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

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
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

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

  const statusVariant = (
    status: string,
  ): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "completed":
        return "default";
      case "error":
        return "destructive";
      case "cancelled":
        return "outline";
      default:
        return "secondary";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calendar size={22} className="text-primary" /> Scheduled & Active
            Jobs
          </h2>
          <p className="text-sm text-muted-foreground">
            Jobs are stored in the database and processed by background workers
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

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading && jobs.length === 0 ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground text-sm">
              No active jobs. Use the Send page to create one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.job_id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {job.job_id}
                    </TableCell>
                    <TableCell className="font-medium">{job.name}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(job.status)}>
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{job.total}</TableCell>
                    <TableCell className="text-green-600 font-medium">
                      {job.sent}
                    </TableCell>
                    <TableCell className="text-destructive font-medium">
                      {job.failed}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {job.created_at
                        ? new Date(job.created_at).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
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
                    </TableCell>
                  </TableRow>
                ))}
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
            Finished Jobs ({finished.length})
          </button>
          {showFinished && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead>Failed</TableHead>
                      <TableHead>Completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {finished.map((job) => (
                      <TableRow key={job.job_id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {job.job_id}
                        </TableCell>
                        <TableCell className="font-medium">
                          {job.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(job.status)}>
                            {job.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{job.total}</TableCell>
                        <TableCell className="text-green-600 font-medium">
                          {job.sent}
                        </TableCell>
                        <TableCell className="text-destructive font-medium">
                          {job.failed}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {job.completed_at
                            ? new Date(job.completed_at).toLocaleString()
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
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
            <AlertDialogTitle>Cancel Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this scheduled job? This action
              cannot be undone.
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
