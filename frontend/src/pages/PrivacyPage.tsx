import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Information We Collect</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>When you use this Service, we may collect:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Account information</strong> — your Clerk user ID,
              authentication metadata, and session tokens.
            </li>
            <li>
              <strong>Recruiter contact data</strong> — names, email addresses,
              companies, titles, and other professional details you import or
              enter.
            </li>
            <li>
              <strong>Email content</strong> — templates, subject lines, and
              message bodies you create.
            </li>
            <li>
              <strong>Sender credentials</strong> — SMTP passwords and Resend
              API keys you provide, stored encrypted via Supabase Vault (never
              in plaintext).
            </li>
            <li>
              <strong>Usage data</strong> — send timestamps, scheduling
              preferences, IP addresses (for consent audit), and job results.
            </li>
            <li>
              <strong>Settings &amp; preferences</strong> — per-user campaign
              defaults, personal info, and SMTP configuration.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">2. How We Use Your Data</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <ul className="list-disc pl-5 space-y-2">
            <li>To operate and deliver the Service's core functionality.</li>
            <li>
              To send emails on your behalf using credentials you provide.
            </li>
            <li>
              To maintain an audit trail of your consent, credential access,
              and email-sending activity for security and compliance.
            </li>
            <li>To improve the Service and troubleshoot issues.</li>
            <li>
              To enforce per-user data isolation so your data is never visible
              to other users.
            </li>
            <li>
              To enforce rate limits and prevent abuse of the Service.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">3. Data Storage &amp; Security</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>Your data is protected by multiple layers of security:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Database</strong> — PostgreSQL hosted on Supabase with
              TLS-encrypted connections and Row-Level Security (RLS) policies
              on all user-scoped tables.
            </li>
            <li>
              <strong>Credential encryption</strong> — Email passwords and API
              keys are encrypted at rest using Supabase Vault (AES-256-GCM).
              They are decrypted server-side only at the moment of sending and
              are never returned to the frontend.
            </li>
            <li>
              <strong>Authentication</strong> — Clerk JWT tokens with JWKS
              verification on every API request, with configurable session
              timeout (default 24 hours).
            </li>
            <li>
              <strong>Transport</strong> — All traffic between client and server
              is encrypted via HTTPS/TLS.
            </li>
            <li>
              <strong>User isolation</strong> — Settings, sender accounts,
              campaigns, and documents are scoped to your user ID. No
              cross-user data access is possible through the API.
            </li>
            <li>
              <strong>Audit logging</strong> — All credential access, email
              sends, and account management operations are recorded in an
              immutable audit trail with timestamps, IP addresses, and user
              agents.
            </li>
            <li>
              <strong>Rate limiting</strong> — API requests are rate-limited
              per user (200/minute default) to prevent abuse and protect
              service availability.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">4. Data Sharing</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            We do not sell, rent, or share your personal data or recruiter
            contact information with third parties. Your email credentials are
            only used to authenticate with the SMTP server or Resend API you
            configure. Data may only be disclosed if required by law or a valid
            court order.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">5. Data Retention &amp; Deletion</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              Email send logs and job results are retained for your auditing
              purposes and can be deleted at any time.
            </li>
            <li>
              Consent records are retained as an immutable audit trail for
              compliance purposes.
            </li>
            <li>
              Security audit logs (credential access, email sends, account
              changes) are retained for security and compliance investigation
              purposes and cannot be modified or deleted by users.
            </li>
            <li>
              You may delete your sender accounts — this removes credentials
              from Supabase Vault permanently and irreversibly.
            </li>
            <li>
              You may request a complete account data deletion by contacting the
              system administrator.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">6. Your Rights</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Access</strong> — You may export your data at any time via
              the Import/Export features.
            </li>
            <li>
              <strong>Rectification</strong> — You may update or correct any of
              your stored data through the UI.
            </li>
            <li>
              <strong>Deletion</strong> — You may delete your campaigns,
              recruiters, sender accounts, and documents at any time.
            </li>
            <li>
              <strong>Portability</strong> — You may export all data to
              Excel/CSV format.
            </li>
            <li>
              <strong>Revocation</strong> — You may revoke consent and stop
              using the Service at any time.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">7. Cookies &amp; Tracking</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            This Service uses Clerk for authentication, which may set session
            cookies. We do not use any third-party analytics, tracking tools,
            advertising pixels, or fingerprinting technologies.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">8. Third-Party Services</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>The Service integrates with the following third-party providers:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Clerk</strong> — Authentication &amp; identity management.
              Subject to{" "}
              <a
                href="https://clerk.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Clerk's Privacy Policy
              </a>
              .
            </li>
            <li>
              <strong>Supabase</strong> — Database hosting &amp; Vault
              encryption. Subject to{" "}
              <a
                href="https://supabase.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Supabase's Privacy Policy
              </a>
              .
            </li>
            <li>
              <strong>Resend</strong> (optional) — Email delivery API. Subject
              to{" "}
              <a
                href="https://resend.com/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Resend's Privacy Policy
              </a>
              .
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">9. Changes to This Policy</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            We may update this Privacy Policy from time to time. If we make
            material changes, the version number will be updated and you will be
            asked to re-accept the policy via the Consent Settings page before
            continuing to send emails.
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center pb-4">
        Version 3.0 &middot; Last updated February 26, 2026
      </p>
    </div>
  );
}
