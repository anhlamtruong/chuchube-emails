import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Acceptance of Terms</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            By accessing and using this email outreach platform ("Service"), you
            agree to be bound by these Terms of Service ("Terms"). If you do not
            agree with any part of these Terms, you must not use the Service.
            Your continued use of the Service after any changes to these Terms
            constitutes your acceptance of the revised Terms.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">2. Description of Service</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            The Service provides tools for managing recruiter contacts,
            composing personalized email campaigns, scheduling outreach emails
            on your behalf, and managing email sender accounts with encrypted
            credential storage. The Service is intended solely for professional
            networking and career-related correspondence.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">3. User Responsibilities</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              You are solely responsible for the content of emails sent through
              the Service.
            </li>
            <li>
              You must not use the Service to send unsolicited bulk email
              (spam), harassing messages, or any content that violates
              applicable laws.
            </li>
            <li>
              You must comply with the CAN-SPAM Act, GDPR, and any other
              applicable anti-spam and data-protection regulations.
            </li>
            <li>
              You must ensure that the email credentials you provide are
              legitimately yours and that you are authorized to send from those
              accounts.
            </li>
            <li>
              You must use strong, unique app passwords or API keys when
              configuring sender accounts and must not reuse your primary email
              password.
            </li>
            <li>
              You are responsible for reviewing and verifying the accuracy of
              recipient data before initiating email campaigns.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            4. Account &amp; Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            Access to the Service is controlled via Clerk authentication with
            JWT-based session tokens. You are responsible for maintaining the
            security of your account credentials and must immediately notify us
            of any unauthorized access. Any activity performed under your
            account is your responsibility. Each user has isolated,
            individually-scoped settings and data that are not shared with other
            users.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            5. Credential Storage &amp; Security
          </CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            Email sender credentials (SMTP passwords, Resend API keys) are
            stored securely using Supabase Vault, which provides server-side
            encryption at rest. Credentials are never stored in plaintext,
            transmitted to the frontend, or logged. All credential access
            (creation, retrieval for sending, updates, and deletion) is recorded
            in an immutable audit log. You may delete your stored credentials at
            any time via the Settings page. We cannot recover your original
            credentials once stored — you must re-enter them if needed.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            6. Audit Logging &amp; Monitoring
          </CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            The Service maintains an immutable, append-only audit log of
            security-relevant events, including:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Credential access, creation, modification, and deletion.</li>
            <li>Email send successes and failures.</li>
            <li>Sender account management operations.</li>
            <li>Session timeout and authentication events.</li>
          </ul>
          <p>
            You may view your own audit logs at any time through the API. Audit
            records include your user ID, IP address, user agent, and
            timestamps. These logs are retained for compliance and security
            investigation purposes.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">7. Rate Limiting</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            To protect the Service and all users, API requests are subject to
            rate limiting. The default limit is 200 requests per minute per
            user. Exceeding rate limits will result in temporary throttling
            (HTTP 429). You must not attempt to circumvent rate limits through
            any means.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">8. Session Management</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            Sessions are managed via JWT tokens with a configurable timeout
            period (default: 24 hours). After the timeout expires, you will be
            required to re-authenticate. Session tokens are validated on every
            API request using cryptographic JWKS verification.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">9. Acceptable Use</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              You must not attempt to access another user's data, settings, or
              credentials.
            </li>
            <li>
              You must not circumvent authentication, authorization, or rate
              limiting mechanisms.
            </li>
            <li>
              You must not use the Service to transmit malicious content,
              phishing attempts, or malware.
            </li>
            <li>
              You must not use automated tools to scrape, overload, or abuse the
              Service beyond its intended functionality.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">10. Limitation of Liability</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            The Service is provided "as is" without warranties of any kind,
            express or implied. We are not liable for any damages arising from
            your use of the Service, including but not limited to email delivery
            failures, data loss, credential compromise due to your actions, or
            reputational harm resulting from emails you send. We are not
            responsible for the security practices of third-party email
            providers (Gmail, Resend, etc.) you connect to the Service.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">11. Termination</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            We reserve the right to suspend or terminate your access to the
            Service at any time, with or without cause, and with or without
            notice. Upon termination, your stored credentials will be purged
            from Supabase Vault. You may request a full data export before
            account termination.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">12. Changes to Terms</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            We may update these Terms from time to time. When we do, the version
            number will be incremented and you will be asked to re-accept the
            updated Terms via the Consent Settings page before continuing to
            send emails. Your continued use of the Service after changes
            constitutes acceptance.
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center pb-4">
        Version 3.0 &middot; Last updated February 26, 2026
      </p>
    </div>
  );
}
