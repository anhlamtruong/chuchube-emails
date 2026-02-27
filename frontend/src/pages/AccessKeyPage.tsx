import { useState, type FormEvent } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { validateAccessKey } from "../api/client";

interface Props {
  onValidated: () => void;
}

export default function AccessKeyPage({ onValidated }: Props) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      setError("Please enter an access key");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await validateAccessKey(key.trim());
      localStorage.setItem("access_key", key.trim());
      onValidated();
    } catch (err: unknown) {
      const detail =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.detail || "Invalid or expired access key";
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-auto">
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
          <div className="space-y-1.5">
            <input
              type="password"
              autoFocus
              placeholder="Access key"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError("");
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <KeyRound className="w-4 h-4 mr-2" />
            )}
            {loading ? "Validating..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
