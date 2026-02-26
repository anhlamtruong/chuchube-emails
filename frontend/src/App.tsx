import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { SignedIn, SignedOut, useAuth } from "@clerk/clerk-react";
import { setClerkTokenGetter } from "./api/client";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import RecruitersPage from "./pages/RecruitersPage";
import ReferralsPage from "./pages/ReferralsPage";
import CampaignsPage from "./pages/CampaignsPage";
import TemplatesPage from "./pages/TemplatesPage";
import DocumentsPage from "./pages/DocumentsPage";
import SendPage from "./pages/SendPage";
import SettingsPage from "./pages/SettingsPage";
import ScheduledJobsPage from "./pages/ScheduledJobsPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import ConsentPage from "./pages/ConsentPage";

function App() {
  const { getToken } = useAuth();

  // Wire Clerk's getToken into the axios client so every API call is authenticated
  useEffect(() => {
    setClerkTokenGetter(getToken);
  }, [getToken]);

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
              <Layout>
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/recruiters" element={<RecruitersPage />} />
                  <Route path="/referrals" element={<ReferralsPage />} />
                  <Route path="/campaigns" element={<CampaignsPage />} />
                  <Route path="/templates" element={<TemplatesPage />} />
                  <Route path="/documents" element={<DocumentsPage />} />
                  <Route path="/send" element={<SendPage />} />
                  <Route
                    path="/scheduled-jobs"
                    element={<ScheduledJobsPage />}
                  />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/consent" element={<ConsentPage />} />
                </Routes>
              </Layout>
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
