import { getRecruiters } from "@/api/client";
import type { Recruiter } from "@/api/client";
import ContactFilterPicker from "./ContactFilterPicker";

interface Props {
  onSelectionChange: (ids: string[], recruiters: Recruiter[]) => void;
  initialSelection?: string[];
}

export default function RecruiterFilterPicker(props: Props) {
  return (
    <ContactFilterPicker<Recruiter>
      fetchFn={getRecruiters}
      entityLabel="recruiters"
      {...props}
    />
  );
}
