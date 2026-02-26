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
            agree to be bound by these Terms of Service. If you do not agree
            with any part of these terms, you must not use the Service.
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
            composing personalized email campaigns, and scheduling outreach
            emails on your behalf. The Service is intended solely for
            professional networking and career-related correspondence.
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
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">4. Account & Authentication</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            Access to the Service is controlled via Clerk authentication. You
            are responsible for maintaining the security of your account
            credentials. Any activity under your account is your responsibility.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">5. Limitation of Liability</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            The Service is provided "as is" without warranties of any kind. We
            are not liable for any damages arising from your use of the Service,
            including but not limited to email delivery failures, data loss, or
            reputational harm resulting from emails you send.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">6. Termination</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            We reserve the right to suspend or terminate your access to the
            Service at any time, with or without cause, and with or without
            notice.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">7. Changes to Terms</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            We may update these Terms from time to time. When we do, the version
            number will be incremented and you will be asked to re-accept the
            updated terms before continuing to send emails. Continued use of the
            Service after changes constitutes acceptance.
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center pb-4">
        Version 1.0 &middot; Last updated {new Date().toLocaleDateString()}
      </p>
    </div>
  );
}
