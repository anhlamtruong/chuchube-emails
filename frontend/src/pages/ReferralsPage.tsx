import { referralsApi } from "@/api/client";
import type { Referral } from "@/api/client";
import { useContactList } from "@/hooks/useContactList";
import { usePageTitle } from "@/hooks/usePageTitle";
import ContactListPage from "@/components/ContactListPage";

export default function ReferralsPage() {
  usePageTitle("Referrals");
  const hook = useContactList<Referral>({
    entityName: "Referral",
    api: referralsApi,
    importStrategy: "clipboard",
    clipboardTarget: "referrals",
  });

  return (
    <ContactListPage<Referral>
      heading="Referrals"
      entityName="Referral"
      {...hook}
    />
  );
}
