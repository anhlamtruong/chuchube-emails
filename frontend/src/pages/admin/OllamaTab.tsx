import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  RefreshCw,
  Download,
  FlaskConical,
  Check,
  Clock,
  Timer,
  ShieldX,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getOllamaStatus,
  pullOllamaModel,
  testOllamaClassify,
} from "../../api/client";
import type { OllamaStatus, OllamaTestResult } from "../../api/client";

export default function OllamaTab() {
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [testResult, setTestResult] = useState<OllamaTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const fetchOllamaStatus = useCallback(async () => {
    setOllamaLoading(true);
    try {
      setOllamaStatus(await getOllamaStatus());
    } catch {
      toast.error("Failed to check Ollama status");
    } finally {
      setOllamaLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOllamaStatus();
  }, [fetchOllamaStatus]);

  const handlePullModel = async () => {
    setPulling(true);
    try {
      await pullOllamaModel();
      toast.success("Model pull started in background");
      setTimeout(() => fetchOllamaStatus(), 5000);
    } catch {
      toast.error("Failed to start model pull");
    } finally {
      setPulling(false);
    }
  };

  const handleTestAI = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testOllamaClassify();
      setTestResult(result);
      const allCorrect = result.results.every(
        (r) =>
          (r.test_label.toLowerCase().includes("hard") &&
            r.classification === "hard_bounce") ||
          (r.test_label.toLowerCase().includes("out of office") &&
            r.classification === "ooo") ||
          (r.test_label.toLowerCase().includes("soft") &&
            r.classification === "soft_bounce"),
      );
      if (allCorrect) {
        toast.success(
          `AI test passed! All 3 samples classified correctly in ${result.total_time_seconds}s`,
        );
      } else {
        toast.warning("AI test completed with some misclassifications");
      }
    } catch {
      toast.error("AI test failed — Ollama may be unavailable or timed out");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Local AI model status (used for bounce classification and future tasks).
      </p>

      {ollamaLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin w-5 h-5 text-muted-foreground" />
        </div>
      ) : ollamaStatus ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Ollama Server</div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`w-2 h-2 rounded-full ${ollamaStatus.available ? "bg-green-500" : "bg-red-500"}`}
                />
                <span className="text-sm font-medium">
                  {ollamaStatus.available ? "Online" : "Offline"}
                </span>
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                Configured Model
              </div>
              <div className="text-sm font-mono mt-1">
                {ollamaStatus.configured_model}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Model Ready</div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`w-2 h-2 rounded-full ${ollamaStatus.model_ready ? "bg-green-500" : "bg-amber-500"}`}
                />
                <span className="text-sm font-medium">
                  {ollamaStatus.model_ready ? "Yes" : "Not Downloaded"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground mb-2">
              Local Models
            </div>
            {ollamaStatus.local_models.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {ollamaStatus.local_models.map((m) => (
                  <Badge key={m} variant="secondary" className="text-xs">
                    {m}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">
                No models downloaded
              </span>
            )}
          </div>

          <div className="flex gap-2">
            {!ollamaStatus.model_ready && ollamaStatus.available && (
              <Button size="sm" onClick={handlePullModel} disabled={pulling}>
                {pulling ? (
                  <Loader2 size={14} className="mr-1 animate-spin" />
                ) : (
                  <Download size={14} className="mr-1" />
                )}
                {pulling
                  ? "Pulling..."
                  : `Pull ${ollamaStatus.configured_model}`}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={fetchOllamaStatus}>
              <RefreshCw size={14} className="mr-1" /> Refresh
            </Button>
          </div>

          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">
              Bounce Detection
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`w-2 h-2 rounded-full ${ollamaStatus.bounce_check_enabled ? "bg-green-500" : "bg-gray-400"}`}
              />
              <span className="text-sm">
                {ollamaStatus.bounce_check_enabled
                  ? "Enabled (background checks active)"
                  : "Disabled"}
              </span>
            </div>
          </div>

          {/* AI Classification Test */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FlaskConical size={14} />
                  AI Classification Test
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Send 3 sample emails through the classifier to verify the
                  model works correctly.
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleTestAI}
                disabled={
                  testing ||
                  !ollamaStatus.available ||
                  !ollamaStatus.model_ready
                }
              >
                {testing ? (
                  <Loader2 size={14} className="mr-1 animate-spin" />
                ) : (
                  <FlaskConical size={14} className="mr-1" />
                )}
                {testing ? "Running Test..." : "Run Test"}
              </Button>
            </div>

            {testing && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 size={12} className="animate-spin" />
                Classifying 3 sample emails with {ollamaStatus.configured_model}
                … This may take 30-120s on CPU.
              </div>
            )}

            {testResult && (
              <div className="space-y-3">
                {/* Summary bar */}
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1">
                    <Timer size={12} />
                    Total: {testResult.total_time_seconds}s
                  </span>
                  <span className="font-mono">{testResult.model}</span>
                  {testResult.healthy ? (
                    <Badge
                      variant="default"
                      className="text-xs bg-green-600 hover:bg-green-600"
                    >
                      Healthy
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">
                      Unhealthy ({testResult.consecutive_failures} failures)
                    </Badge>
                  )}
                </div>

                {/* Results table */}
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">
                          Test Case
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Input Preview
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Result
                        </th>
                        <th className="text-left px-3 py-2 font-medium">
                          Status
                        </th>
                        <th className="text-right px-3 py-2 font-medium">
                          Time
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {testResult.results.map((r, i) => {
                        const expected = r.test_label
                          .toLowerCase()
                          .includes("hard")
                          ? "hard_bounce"
                          : r.test_label.toLowerCase().includes("out of office")
                            ? "ooo"
                            : r.test_label.toLowerCase().includes("soft")
                              ? "soft_bounce"
                              : "normal";
                        const passed = r.classification === expected;
                        return (
                          <tr key={i} className="border-b last:border-b-0">
                            <td className="px-3 py-2 font-medium whitespace-nowrap">
                              {r.test_label}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground max-w-[250px] truncate">
                              {r.input_preview}
                            </td>
                            <td className="px-3 py-2">
                              <Badge
                                variant={
                                  r.classification === "hard_bounce"
                                    ? "destructive"
                                    : r.classification === "soft_bounce"
                                      ? "secondary"
                                      : r.classification === "ooo"
                                        ? "outline"
                                        : "secondary"
                                }
                                className="text-xs"
                              >
                                {r.classification}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              {passed ? (
                                <span className="text-green-600 font-medium flex items-center gap-1">
                                  <Check size={12} /> Pass
                                </span>
                              ) : (
                                <span className="text-red-600 font-medium flex items-center gap-1">
                                  <ShieldX size={12} /> Fail
                                  <span className="text-muted-foreground font-normal">
                                    (expected: {expected})
                                  </span>
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground flex items-center justify-end gap-1">
                              <Clock size={10} />
                              {r.time_seconds}s
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Unable to check Ollama status.
        </div>
      )}
    </div>
  );
}
