import { cn } from "@/lib/utils";

interface ProgressRingProps {
  /** 0 – 100 */
  value: number;
  /** Diameter in px */
  size?: number;
  strokeWidth?: number;
  /** e.g. "42/100" — shown below the percentage */
  label?: string;
  /** running / completed / error */
  status?: string;
  className?: string;
}

export default function ProgressRing({
  value,
  size = 120,
  strokeWidth = 8,
  label,
  status = "running",
  className,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;

  const strokeColor =
    status === "completed"
      ? "stroke-green-500"
      : status === "error" || status === "stale"
        ? "stroke-destructive"
        : "stroke-primary";

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        {/* Fill arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold leading-none">
          {Math.round(value)}%
        </span>
        {label && (
          <span className="text-xs text-muted-foreground mt-0.5">{label}</span>
        )}
      </div>
    </div>
  );
}
