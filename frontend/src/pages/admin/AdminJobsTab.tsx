import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  RefreshCw,
  Trash2,
  Search,
  X,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  getAdminJobs,
  adminCancelJob,
  adminForceErrorJob,
} from "../../api/client";
import type { AdminJob, AdminJobFilters } from "../../api/client";

export default function AdminJobsTab() {
  const navigate = useNavigate();
  const [adminJobs, setAdminJobs] = useState<AdminJob[]>([]);
  const [adminJobsTotal, setAdminJobsTotal] = useState(0);
  const [adminJobsLoading, setAdminJobsLoading] = useState(false);
  const [adminJobsPage, setAdminJobsPage] = useState(1);
  const [adminJobsFilters, setAdminJobsFilters] = useState<AdminJobFilters>({
    per_page: 20,
  });
  const [adminJobsSearch, setAdminJobsSearch] = useState("");
  const [adminJobsStatus, setAdminJobsStatus] = useState("");
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const [forcingErrorJobId, setForcingErrorJobId] = useState<string | null>(
    null,
  );

  const fetchAdminJobs = useCallback(
    async (page = 1, filters: AdminJobFilters = {}) => {
      setAdminJobsLoading(true);
      try {
        const result = await getAdminJobs({ ...filters, page, per_page: 20 });
        setAdminJobs(result.jobs);
        setAdminJobsTotal(result.total);
        setAdminJobsPage(result.page);
      } catch {
        toast.error("Failed to load jobs");
      } finally {
        setAdminJobsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchAdminJobs();
  }, [fetchAdminJobs]);

  const handleAdminCancelJob = async (jobId: string) => {
    setCancellingJobId(jobId);
    try {
      await adminCancelJob(jobId);
      toast.success("Job cancelled");
      fetchAdminJobs(adminJobsPage, adminJobsFilters);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (e as any)?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Failed to cancel job");
    } finally {
      setCancellingJobId(null);
    }
  };

  const handleForceError = async (jobId: string) => {
    setForcingErrorJobId(jobId);
    try {
      await adminForceErrorJob(jobId);
      toast.success("Job force-marked as error");
      fetchAdminJobs(adminJobsPage, adminJobsFilters);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (e as any)?.response?.data?.detail;
      toast.error(
        typeof detail === "string" ? detail : "Failed to force-error job",
      );
    } finally {
      setForcingErrorJobId(null);
    }
  };

  const applyAdminJobFilters = useCallback(() => {
    const filters: AdminJobFilters = {};
    if (adminJobsStatus) filters.status = adminJobsStatus;
    if (adminJobsSearch.trim()) filters.search = adminJobsSearch.trim();
    setAdminJobsFilters(filters);
    fetchAdminJobs(1, filters);
  }, [adminJobsStatus, adminJobsSearch, fetchAdminJobs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          View, search and manage all email jobs across all users.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fetchAdminJobs(adminJobsPage, adminJobsFilters)}
          disabled={adminJobsLoading}
        >
          {adminJobsLoading ? (
            <Loader2 size={14} className="mr-1 animate-spin" />
          ) : (
            <RefreshCw size={14} className="mr-1" />
          )}
          Refresh
        </Button>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs mb-1 block">Search</Label>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="User email, recipient, or sender..."
              value={adminJobsSearch}
              onChange={(e) => setAdminJobsSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyAdminJobFilters()}
              className="pl-8 h-9"
            />
            {adminJobsSearch && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setAdminJobsSearch("");
                  const filters = { ...adminJobsFilters };
                  delete filters.search;
                  setAdminJobsFilters(filters);
                  fetchAdminJobs(1, filters);
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="w-[150px]">
          <Label className="text-xs mb-1 block">Status</Label>
          <select
            value={adminJobsStatus}
            onChange={(e) => setAdminJobsStatus(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All</option>
            <option value="queued">Queued</option>
            <option value="scheduled">Scheduled</option>
            <option value="running">Running</option>
            <option value="stale">Stale</option>
            <option value="completed">Completed</option>
            <option value="error">Error</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <Button size="sm" onClick={applyAdminJobFilters}>
          <Search size={14} className="mr-1" /> Filter
        </Button>
      </div>

      {/* Jobs Table */}
      {adminJobsLoading && adminJobs.length === 0 ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin w-5 h-5 text-muted-foreground" />
        </div>
      ) : adminJobs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No jobs found.
        </div>
      ) : (
        <>
          <div className="rounded-lg border overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">User</th>
                  <th className="text-left px-3 py-2 font-medium">Job</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Progress</th>
                  <th className="text-left px-3 py-2 font-medium">Created</th>
                  <th className="text-left px-3 py-2 font-medium">Scheduled</th>
                  <th className="text-left px-3 py-2 font-medium">Completed</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {adminJobs.map((job) => {
                  const pct =
                    job.total > 0
                      ? Math.round(((job.sent + job.failed) / job.total) * 100)
                      : 0;
                  return (
                    <tr
                      key={job.job_id}
                      className="border-b last:border-b-0 hover:bg-muted/30"
                    >
                      <td className="px-3 py-2 text-xs">
                        <span className="font-medium">{job.user_email}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">{job.name}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            job.status === "completed"
                              ? "default"
                              : job.status === "running"
                                ? "secondary"
                                : job.status === "error"
                                  ? "destructive"
                                  : job.status === "cancelled"
                                    ? "outline"
                                    : "secondary"
                          }
                          className="text-xs"
                        >
                          {job.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-muted-foreground">
                            {job.sent}/{job.total}
                            {job.failed > 0 && (
                              <span className="text-red-500 ml-1">
                                ({job.failed} failed)
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {job.created_at
                          ? new Date(job.created_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {job.scheduled_at
                          ? new Date(job.scheduled_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {job.completed_at
                          ? new Date(job.completed_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() =>
                              navigate(`/scheduled-jobs/${job.job_id}`)
                            }
                          >
                            <ExternalLink size={13} />
                          </Button>
                          {(job.status === "queued" ||
                            job.status === "scheduled" ||
                            job.status === "error" ||
                            job.status === "stale") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-red-500 hover:text-red-700"
                              onClick={() => handleAdminCancelJob(job.job_id)}
                              disabled={cancellingJobId === job.job_id}
                            >
                              {cancellingJobId === job.job_id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Trash2 size={13} />
                              )}
                            </Button>
                          )}
                          {job.status === "running" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-orange-500 hover:text-orange-700"
                              title="Force mark as error"
                              onClick={() => handleForceError(job.job_id)}
                              disabled={forcingErrorJobId === job.job_id}
                            >
                              {forcingErrorJobId === job.job_id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <AlertTriangle size={13} />
                              )}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {adminJobsTotal > 20 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Showing {(adminJobsPage - 1) * 20 + 1}–
                {Math.min(adminJobsPage * 20, adminJobsTotal)} of{" "}
                {adminJobsTotal}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={adminJobsPage <= 1}
                  onClick={() =>
                    fetchAdminJobs(adminJobsPage - 1, adminJobsFilters)
                  }
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={adminJobsPage * 20 >= adminJobsTotal}
                  onClick={() =>
                    fetchAdminJobs(adminJobsPage + 1, adminJobsFilters)
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
