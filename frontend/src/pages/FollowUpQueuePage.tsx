import { useEffect, useState, useCallback } from "react";
import {
  getThreads,
  getThreadsNeedingFollowup,
  getThreadStats,
} from "@/api/client";
import type { ThreadListItem, ThreadStats } from "@/api/threads";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useJobSSE } from "@/hooks/useJobSSE";
import ThreadPanel from "@/components/ThreadPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Clock,
  CheckCircle,
  AlertTriangle,
  MessageSquare,
  Inbox,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_TABS = [
  { value: "all", label: "All Threads", icon: Inbox },
  { value: "awaiting_reply", label: "Awaiting", icon: Clock },
  { value: "replied", label: "Replied", icon: MessageSquare },
  { value: "needs_followup", label: "Follow-up", icon: AlertTriangle },
  { value: "closed", label: "Closed", icon: XCircle },
];

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const statusBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  sent: "secondary",
  awaiting_reply: "default",
  replied: "outline",
  needs_followup: "destructive",
  closed: "secondary",
};

export default function FollowUpQueuePage() {
  usePageTitle("Follow-Up Queue");
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [stats, setStats] = useState<ThreadStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const load = useCallback(
    async (tab?: string) => {
      const status = tab ?? activeTab;
      try {
        setLoading(true);
        const [threadsData, statsData] = await Promise.all([
          status === "all"
            ? getThreads({ limit: 100 })
            : status === "needs_followup"
              ? getThreadsNeedingFollowup(100)
              : getThreads({ status, limit: 100 }),
          getThreadStats(),
        ]);
        setThreads(threadsData);
        setStats(statsData);
      } catch {
        toast.error("Failed to load threads");
      } finally {
        setLoading(false);
      }
    },
    [activeTab],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh on SSE thread events
  useJobSSE({
    enabled: true,
    onJobUpdate: useCallback(() => {
      // Refresh when new thread events come through
      load();
    }, [load]),
  });

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    load(tab);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Follow-Up Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track email conversations and manage follow-ups
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {stats ? (
          <>
            <StatCard label="Total" value={stats.total} icon={Inbox} />
            <StatCard
              label="Awaiting Reply"
              value={stats.awaiting_reply}
              icon={Clock}
            />
            <StatCard
              label="Replied"
              value={stats.replied}
              icon={MessageSquare}
              className="text-green-600"
            />
            <StatCard
              label="Need Follow-up"
              value={stats.needs_followup}
              icon={AlertTriangle}
              className="text-orange-600"
            />
            <StatCard
              label="Overdue"
              value={stats.overdue_followups}
              icon={AlertTriangle}
              className="text-red-600"
            />
            <StatCard
              label="Closed"
              value={stats.closed}
              icon={CheckCircle}
            />
          </>
        ) : (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))
        )}
      </div>

      {/* Tabs + Thread list */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          {STATUS_TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="gap-1.5">
              <Icon size={14} />
              {label}
              {stats && value !== "all" && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                  {value === "awaiting_reply"
                    ? stats.awaiting_reply
                    : value === "replied"
                      ? stats.replied
                      : value === "needs_followup"
                        ? stats.needs_followup
                        : value === "closed"
                          ? stats.closed
                          : 0}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : threads.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Inbox size={40} className="mx-auto mb-3 opacity-50" />
              <p>No threads found</p>
            </div>
          ) : (
            <div className="space-y-1">
              {threads.map((t) => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  isSelected={t.id === selectedThreadId}
                  onSelect={() => setSelectedThreadId(t.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Thread detail panel */}
      {selectedThreadId && (
        <ThreadPanel
          threadId={selectedThreadId}
          onClose={() => setSelectedThreadId(null)}
          onStatusChange={() => load()}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: number;
  icon: typeof Clock;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <Icon size={16} className={cn("text-muted-foreground", className)} />
          <span className={cn("text-xl font-bold", className)}>{value}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

function ThreadRow({
  thread,
  isSelected,
  onSelect,
}: {
  thread: ThreadListItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isOverdue =
    thread.followup_due_at && new Date(thread.followup_due_at) < new Date();

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors",
        isSelected
          ? "bg-accent border-primary/30"
          : "hover:bg-muted/50 border-transparent",
        isOverdue && thread.status !== "closed" && "border-red-200",
      )}
    >
      {/* Status indicator */}
      <div
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          thread.status === "replied"
            ? "bg-green-500"
            : thread.status === "needs_followup"
              ? "bg-orange-500"
              : thread.status === "awaiting_reply"
                ? "bg-blue-500"
                : "bg-gray-400",
        )}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {thread.recipient_name || thread.recipient_email || "Unknown"}
          </span>
          {thread.company && (
            <span className="text-xs text-muted-foreground truncate">
              {thread.company}
            </span>
          )}
          <Badge
            variant={statusBadgeVariant[thread.status] ?? "secondary"}
            className="ml-auto text-xs shrink-0"
          >
            {thread.status.replace("_", " ")}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {thread.subject}
          {thread.latest_message_preview &&
            ` — ${thread.latest_message_preview}`}
        </p>
      </div>

      {/* Meta */}
      <div className="text-right shrink-0">
        <p className="text-xs text-muted-foreground">
          {formatRelative(thread.last_activity_at)}
        </p>
        {thread.reply_count > 0 && (
          <div className="flex items-center gap-1 justify-end mt-0.5">
            <MessageSquare size={10} className="text-green-500" />
            <span className="text-xs text-green-600">{thread.reply_count}</span>
          </div>
        )}
      </div>
    </button>
  );
}
