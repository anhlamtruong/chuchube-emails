import { useEffect, useState, useCallback } from "react";
import { getThread, updateThreadStatus, snoozeThread } from "@/api/client";
import type { ThreadDetail, ThreadMessage } from "@/api/threads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  X,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  CheckCircle,
  AlertTriangle,
  Pause,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import DOMPurify from "dompurify";

interface ThreadPanelProps {
  threadId: string | null;
  onClose: () => void;
  onStatusChange?: () => void;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }
> = {
  sent: { label: "Sent", variant: "secondary", icon: ArrowUpRight },
  awaiting_reply: { label: "Awaiting Reply", variant: "default", icon: Clock },
  replied: { label: "Replied", variant: "outline", icon: CheckCircle },
  needs_followup: {
    label: "Needs Follow-up",
    variant: "destructive",
    icon: AlertTriangle,
  },
  closed: { label: "Closed", variant: "secondary", icon: CheckCircle },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ThreadPanel({
  threadId,
  onClose,
  onStatusChange,
}: ThreadPanelProps) {
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!threadId) return;
    setLoading(true);
    getThread(threadId)
      .then(setThread)
      .catch(() => toast.error("Failed to load thread"))
      .finally(() => setLoading(false));
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatusChange = async (newStatus: string) => {
    if (!threadId) return;
    try {
      await updateThreadStatus(threadId, newStatus);
      toast.success(`Thread marked as ${newStatus.replace("_", " ")}`);
      load();
      onStatusChange?.();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleSnooze = async (days: number) => {
    if (!threadId) return;
    try {
      await snoozeThread(threadId, days);
      toast.success(`Follow-up snoozed for ${days} day${days > 1 ? "s" : ""}`);
      load();
      onStatusChange?.();
    } catch {
      toast.error("Failed to snooze thread");
    }
  };

  if (!threadId) return null;

  const statusCfg = thread
    ? STATUS_CONFIG[thread.status] ?? STATUS_CONFIG.sent
    : STATUS_CONFIG.sent;
  const StatusIcon = statusCfg.icon;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-background border-l shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex-1 min-w-0">
          {loading ? (
            <Skeleton className="h-5 w-48" />
          ) : thread ? (
            <>
              <h2 className="text-sm font-semibold truncate">
                {thread.recipient_name || thread.recipient_email || "Unknown"}
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                {thread.company && `${thread.company} · `}
                {thread.subject}
              </p>
            </>
          ) : null}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X size={18} />
        </Button>
      </div>

      {/* Status bar */}
      {thread && (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
          <Badge variant={statusCfg.variant} className="gap-1">
            <StatusIcon size={12} />
            {statusCfg.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {thread.reply_count} {thread.reply_count === 1 ? "reply" : "replies"}
          </span>
          {thread.followup_due_at && (
            <span className="text-xs text-muted-foreground ml-auto">
              Follow-up: {formatDate(thread.followup_due_at)}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      {thread && (
        <div className="flex items-center gap-1 px-4 py-2 border-b flex-wrap">
          {thread.status !== "closed" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStatusChange("closed")}
            >
              <CheckCircle size={14} className="mr-1" />
              Close
            </Button>
          )}
          {thread.status === "closed" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleStatusChange("awaiting_reply")}
            >
              <Clock size={14} className="mr-1" />
              Reopen
            </Button>
          )}
          {["awaiting_reply", "needs_followup"].includes(thread.status) && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSnooze(3)}
              >
                <Pause size={14} className="mr-1" />
                Snooze 3d
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSnooze(7)}
              >
                <Pause size={14} className="mr-1" />
                Snooze 7d
              </Button>
            </>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))
        ) : thread ? (
          thread.messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        ) : (
          <p className="text-sm text-muted-foreground text-center mt-8">
            Thread not found
          </p>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ThreadMessage }) {
  const isOutbound = message.direction === "outbound";
  const [showHtml, setShowHtml] = useState(false);

  return (
    <Card
      className={cn(
        "overflow-hidden",
        isOutbound ? "ml-4 border-blue-200" : "mr-4 border-green-200",
      )}
    >
      <CardContent className="p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          {isOutbound ? (
            <ArrowUpRight size={14} className="text-blue-500 shrink-0" />
          ) : (
            <ArrowDownLeft
              size={14}
              className="text-green-500 shrink-0"
            />
          )}
          <span className="text-xs font-medium truncate">
            {isOutbound ? message.to_email : message.from_email}
          </span>
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {formatRelative(message.sent_at)}
          </span>
        </div>

        {/* Subject */}
        <p className="text-xs text-muted-foreground mb-1 truncate">
          {message.subject}
        </p>

        {/* Body */}
        {showHtml && message.body_html ? (
          <div
            className="text-sm prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(message.body_html),
            }}
          />
        ) : (
          <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-4">
            {message.body_text ||
              message.subject ||
              "(No text content)"}
          </p>
        )}

        {message.body_html && (
          <button
            onClick={() => setShowHtml(!showHtml)}
            className="text-xs text-primary hover:underline mt-1"
          >
            {showHtml ? "Show text" : "Show HTML"}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
