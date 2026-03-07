import { recruitersApi } from "@/api/client";
import type { Recruiter } from "@/api/client";
import { useContactList } from "@/hooks/useContactList";
import { usePageTitle } from "@/hooks/usePageTitle";
import ContactListPage from "@/components/ContactListPage";

export default function RecruitersPage() {
  usePageTitle("Recruiters");
  const hook = useContactList<Recruiter>({
    entityName: "Recruiter",
    api: recruitersApi,
    importStrategy: "bulk",
    clipboardTarget: "recruiters",
  });

  return (
    <ContactListPage<Recruiter>
      heading="Recruiters"
      entityName="Recruiter"
      {...hook}
    />
  );
}
