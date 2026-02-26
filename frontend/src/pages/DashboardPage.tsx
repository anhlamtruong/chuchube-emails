import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDashboard } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Table,
  Send,
  Clock,
  Plus,
  Upload,
  Calendar,
} from "lucide-react";

interface UpcomingJob {
  job_id: string;
  status: string;
  total: number;
  sent: number;
  created_at: string | null;
}

interface DashboardData {
  total_recruiters: number;
  total_campaigns: number;
  by_status: Record<string, number>;
  upcoming_jobs?: UpcomingJob[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getDashboard().then(setData);
  }, []);

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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar size={16} /> Upcoming Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(data.upcoming_jobs ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No scheduled jobs</p>
            ) : (
              <div className="space-y-2">
                {data.upcoming_jobs!.map((job) => (
                  <div
                    key={job.job_id}
                    className="flex items-center justify-between p-2 bg-muted rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        Job #{job.job_id} — {job.total} email(s)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {job.created_at
                          ? new Date(job.created_at).toLocaleString()
                          : "—"}
                      </p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {job.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
