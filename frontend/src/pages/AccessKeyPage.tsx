import { useState, type FormEvent } from "react";
import { KeyRound, Loader2, ShieldX, ShieldOff, UserX, AlertCircle, Mail } from "lucide-react";
import { validateAccessKey } from "../api/client";

interface Props {
  onValidated: () => void;
}

type ErrorCode = "not_found" | "revoked" | "already_claimed" | "empty" | "unknown";

const ERROR_CONFIG: Record<ErrorCode, { icon: typeof ShieldX; label: string; color: string }> = {
  not_found: {
    icon: ShieldX,
    label: "Key not found",
    color: "text-destructive",
  },
  revoked: {
    icon: ShieldOff,
    label: "Key revoked",
    color: "text-amber-600",
  },
  already_claimed: {
    icon: UserX,
    label: "Key already claimed",
    color: "text-orange-600",
  },
  empty: {
    icon: AlertCircle,
    label: "Missing key",
    color: "text-muted-foreground",
  },
  unknown: {
    icon: AlertCircle,
    label: "Something went wrong",
    color: "text-destructive",
  },
};

export default function AccessKeyPage({ onValidated }: Props) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<{ code: ErrorCode; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      setError({ code: "empty", message: "Please enter an access key." });
      triggerShake();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await validateAccessKey(key.trim());
      localStorage.setItem("access_key", key.trim());
      onValidated();
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data?.detail;

      if (detail && typeof detail === "object" && detail.error_code) {
        setError({
          code: detail.error_code as ErrorCode,
          message: detail.message || "Invalid access key.",
        });
      } else {
        const msg = typeof detail === "string" ? detail : "An unexpected error occurred. Please try again.";
        setError({ code: "unknown", message: msg });
      }
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const errCfg = error ? ERROR_CONFIG[error.code] || ERROR_CONFIG.unknown : null;
  const ErrIcon = errCfg?.icon;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className={`w-full max-w-sm mx-auto ${shake ? "animate-shake" : ""}`}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
            <KeyRound className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">ChuChuBe Emails</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your access key to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <input
              type="password"
              autoFocus
              placeholder="Access key"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                if (error) setError(null);
              }}
              className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors ${
                error ? "border-destructive" : "border-input"
              }`}
            />

            {error && errCfg && ErrIcon && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <ErrIcon className={`w-4 h-4 mt-0.5 shrink-0 ${errCfg.color}`} />
                <div className="space-y-1 min-w-0">
                  <p className={`text-sm font-medium ${errCfg.color}`}>{errCfg.label}</p>
                  <p className="text-xs text-muted-foreground">{error.message}</p>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <KeyRound className="w-4 h-4 mr-2" />
            )}
            {loading ? "Validating..." : "Continue"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            Don't have a key?{" "}
            <a
              href="mailto:anhlamtruong1012@gmail.com?subject=ChuChuBe%20Emails%20%E2%80%93%20Access%20Key%20Request"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Mail className="w-3 h-3" />
              Request access
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
