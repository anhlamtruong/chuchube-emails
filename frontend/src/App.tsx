import { useEffect, useState, Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { SignedIn, SignedOut, useAuth } from "@clerk/clerk-react";
import { setClerkTokenGetter } from "./api/client";
import { getAccessKey, listenForAccessKey } from "./lib/accessKeyStore";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import AccessKeyPage from "./pages/AccessKeyPage";

// Lazy-loaded pages — each gets its own chunk for faster initial load
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const RecruitersPage = lazy(() => import("./pages/RecruitersPage"));
const ReferralsPage = lazy(() => import("./pages/ReferralsPage"));
const CampaignsPage = lazy(() => import("./pages/CampaignsPage"));
const TemplatesPage = lazy(() => import("./pages/TemplatesPage"));
const DocumentsPage = lazy(() => import("./pages/DocumentsPage"));
const SendPage = lazy(() => import("./pages/SendPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ScheduledJobsPage = lazy(() => import("./pages/ScheduledJobsPage"));
const JobDetailPage = lazy(() => import("./pages/JobDetailPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const ConsentPage = lazy(() => import("./pages/ConsentPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));

function App() {
  const { getToken } = useAuth();
  const [hasAccessKey, setHasAccessKey] = useState(() => !!getAccessKey());

  // Wire Clerk's getToken into the axios client so every API call is authenticated
  useEffect(() => {
    setClerkTokenGetter(getToken);
  }, [getToken]);

  // Sync access-key changes from other tabs via BroadcastChannel
  useEffect(() => {
    return listenForAccessKey(
      () => setHasAccessKey(true),
      () => {
        setHasAccessKey(false);
        // Navigate to root so the access-key gate appears
        window.location.href = "/";
      },
    );
  }, []);

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <>
            <SignedIn>
              <Navigate to="/" replace />
            </SignedIn>
            <SignedOut>
              <LoginPage />
            </SignedOut>
          </>
        }
      />
      <Route
        path="/*"
        element={
          <>
            <SignedIn>
              {!hasAccessKey ? (
                <AccessKeyPage onValidated={() => setHasAccessKey(true)} />
              ) : (
                <Layout>
                  <ErrorBoundary>
                    <Suspense
                      fallback={
                        <div className="flex items-center justify-center h-64">
                          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                        </div>
                      }
                    >
                      <Routes>
                        <Route path="/" element={<DashboardPage />} />
                        <Route
                          path="/recruiters"
                          element={<RecruitersPage />}
                        />
                        <Route path="/referrals" element={<ReferralsPage />} />
                        <Route path="/campaigns" element={<CampaignsPage />} />
                        <Route path="/templates" element={<TemplatesPage />} />
                        <Route path="/documents" element={<DocumentsPage />} />
                        <Route path="/send" element={<SendPage />} />
                        <Route
                          path="/scheduled-jobs"
                          element={<ScheduledJobsPage />}
                        />
                        <Route
                          path="/scheduled-jobs/:id"
                          element={<JobDetailPage />}
                        />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/terms" element={<TermsPage />} />
                        <Route path="/privacy" element={<PrivacyPage />} />
                        <Route path="/consent" element={<ConsentPage />} />
                        <Route path="/admin" element={<AdminPage />} />
                      </Routes>
                    </Suspense>
                  </ErrorBoundary>
                </Layout>
              )}
            </SignedIn>
            <SignedOut>
              <Navigate to="/login" replace />
            </SignedOut>
          </>
        }
      />
    </Routes>
  );
}

export default App;
