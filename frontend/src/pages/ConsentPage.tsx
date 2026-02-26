import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getConsentStatus,
  acceptAllConsents,
  getConsentHistory,
  type ConsentItem,
  type ConsentHistoryItem,
} from "@/api/client";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
  ShieldCheck,
  Loader2,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const CONSENT_LABELS: Record<
  string,
  { label: string; description: string; link: string }
> = {
  terms_of_service: {
    label: "Terms of Service",
    description:
      "I have read and agree to the Terms of Service, including acceptable use policies, credential storage terms, and limitation of liability.",
    link: "/terms",
  },
  privacy_policy: {
    label: "Privacy Policy",
    description:
      "I have read and agree to the Privacy Policy, including how my data, credentials, and personal information are collected, stored, and protected.",
    link: "/privacy",
  },
  send_on_behalf: {
    label: "Send on Behalf Authorization",
    description:
      "I authorize this platform to send emails on my behalf using the email credentials I have provided. I understand my credentials are encrypted via Supabase Vault and only decrypted at send time.",
    link: "",
  },
  data_security: {
    label: "Data Security Acknowledgment",
    description:
      "I acknowledge that my email credentials are stored with server-side encryption (Supabase Vault), my settings are isolated per-user, and I will use strong app passwords or API keys rather than my primary email password.",
    link: "",
  },
};

export default function ConsentPage() {
  const [consents, setConsents] = useState<ConsentItem[]>([]);
  const [allAccepted, setAllAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [history, setHistory] = useState<ConsentHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const data = await getConsentStatus();
      setConsents(data.consents);
      setAllAccepted(data.all_accepted);
      // Pre-check already accepted
      const init: Record<string, boolean> = {};
      for (const c of data.consents) {
        init[c.consent_type] = c.accepted;
      }
      setChecked(init);
    } catch {
      toast.error("Failed to load consent status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAcceptAll = async () => {
    // Ensure all checkboxes are checked
    const unchecked = consents.filter(
      (c) => !c.accepted && !checked[c.consent_type],
    );
    if (unchecked.length > 0) {
      toast.error("Please check all boxes before accepting.");
      return;
    }

    setAccepting(true);
    try {
      await acceptAllConsents();
      toast.success("All consents accepted!");
      await load();
    } catch {
      toast.error("Failed to accept consents");
    } finally {
      setAccepting(false);
    }
  };

  const loadHistory = async () => {
    try {
      const data = await getConsentHistory();
      setHistory(data.history);
      setShowHistory(true);
    } catch {
      toast.error("Failed to load consent history");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pendingConsents = consents.filter((c) => !c.accepted);
  const allChecked = pendingConsents.every((c) => checked[c.consent_type]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">
            Consent & Agreements
          </h1>
        </div>
        <Button variant="outline" size="sm" onClick={loadHistory}>
          <History className="h-4 w-4 mr-2" />
          History
        </Button>
      </div>

      {allAccepted && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="flex items-center gap-3 pt-6">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-green-700 dark:text-green-400 font-medium">
              All required consents have been accepted. You're all set!
            </span>
          </CardContent>
        </Card>
      )}

      {consents.map((c) => {
        const meta = CONSENT_LABELS[c.consent_type] ?? {
          label: c.consent_type,
          description: "",
          link: "",
        };
        return (
          <Card key={c.consent_type}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  {c.accepted ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                  {meta.label}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    v{c.required_version}
                  </Badge>
                  {c.accepted ? (
                    <Badge className="bg-green-600 text-white text-xs">
                      Accepted
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">
                      Pending
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-gray-300 accent-primary"
                  checked={checked[c.consent_type] ?? false}
                  disabled={c.accepted}
                  onChange={(e) =>
                    setChecked((prev) => ({
                      ...prev,
                      [c.consent_type]: e.target.checked,
                    }))
                  }
                />
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {meta.description}
                  </p>
                  {meta.link && (
                    <Link
                      to={meta.link}
                      className="text-sm text-primary hover:underline"
                    >
                      Read full {meta.label} &rarr;
                    </Link>
                  )}
                  {c.accepted && c.accepted_at && (
                    <p className="text-xs text-muted-foreground">
                      Accepted on {new Date(c.accepted_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {!allAccepted && (
        <div className="flex justify-end">
          <Button
            size="lg"
            onClick={handleAcceptAll}
            disabled={!allChecked || accepting}
          >
            {accepting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Accept All &amp; Continue
          </Button>
        </div>
      )}

      {/* History panel */}
      {showHistory && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-5 w-5" />
              Consent History (Audit Trail)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No records yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm border-b last:border-0 py-2"
                  >
                    <div>
                      <span className="font-medium">
                        {CONSENT_LABELS[h.consent_type]?.label ??
                          h.consent_type}
                      </span>
                      <span className="text-muted-foreground ml-2">
                        v{h.version}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-xs text-right">
                      <div>
                        {h.accepted_at
                          ? new Date(h.accepted_at).toLocaleString()
                          : "N/A"}
                      </div>
                      {h.ip_address && <div>IP: {h.ip_address}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
