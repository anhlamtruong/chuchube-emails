import { usePageTitle } from "@/hooks/usePageTitle";
import SettingsGroupsSection from "./settings/SettingsGroupsSection";
import CustomColumnsSection from "./settings/CustomColumnsSection";
import EmailAccountsSection from "./settings/EmailAccountsSection";
import BounceDetectionSummary from "./settings/BounceDetectionSummary";

export default function SettingsPage() {
  usePageTitle("Settings");
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <SettingsGroupsSection />
      <CustomColumnsSection />
      <EmailAccountsSection />
      <BounceDetectionSummary />
    </div>
  );
}
