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
              <strong>Account information</strong> — your Clerk user ID and
              authentication metadata.
            </li>
            <li>
              <strong>Recruiter contact data</strong> — names, email addresses,
              companies, and other professional details you import or enter.
            </li>
            <li>
              <strong>Email content</strong> — templates, subject lines, and
              message bodies you create.
            </li>
            <li>
              <strong>Usage data</strong> — send timestamps, scheduling
              preferences, IP addresses (for consent audit), and job results.
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
              To maintain an audit trail of your consent and email-sending
              activity.
            </li>
            <li>To improve the Service and troubleshoot issues.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">3. Data Storage & Security</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            Your data is stored in a PostgreSQL database hosted on Supabase.
            Communication between the frontend and backend is encrypted via
            HTTPS. Email credentials are stored as environment variables on the
            server and are never persisted in the database.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">4. Data Sharing</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            We do not sell, rent, or share your personal data or recruiter
            contact information with third parties. Data may only be disclosed
            if required by law.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">5. Your Rights</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              You may export or delete your data at any time via the
              Import/Export features.
            </li>
            <li>
              You may revoke consent and stop using the Service at any time.
            </li>
            <li>
              If you have questions about your data, contact the system
              administrator.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">6. Cookies & Tracking</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            This Service uses Clerk for authentication, which may set session
            cookies. We do not use any third-party analytics or tracking tools.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">7. Changes to This Policy</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-3 text-muted-foreground">
          <p>
            We may update this Privacy Policy from time to time. If we make
            material changes, the version number will be updated and you will be
            asked to re-accept the policy before continuing to send emails.
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center pb-4">
        Version 1.0 &middot; Last updated {new Date().toLocaleDateString()}
      </p>
    </div>
  );
}
