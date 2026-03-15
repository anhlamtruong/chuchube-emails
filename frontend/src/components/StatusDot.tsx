import { cn } from "@/lib/utils";

const colorMap: Record<string, string> = {
  queued: "bg-gray-400",
  scheduled: "bg-blue-500",
  running: "bg-amber-500",
  completed: "bg-green-500",
  error: "bg-red-500",
  stale: "bg-orange-500",
  cancelled: "bg-slate-400",
  sent: "bg-green-500",
  failed: "bg-red-500",
  pending: "bg-gray-400",
  response: "bg-blue-500",
  ooo: "bg-blue-400",
};

interface StatusDotProps {
  status: string;
  pulse?: boolean;
  className?: string;
}

export default function StatusDot({
  status,
  pulse,
  className,
}: StatusDotProps) {
  const shouldPulse = pulse ?? status === "running";
  const color = colorMap[status] ?? "bg-gray-400";

  return (
    <span className={cn("relative inline-flex h-2.5 w-2.5", className)}>
      {shouldPulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
            color,
          )}
        />
      )}
      <span
        className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", color)}
      />
    </span>
  );
}
