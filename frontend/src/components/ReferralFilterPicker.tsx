import { getReferrals } from "@/api/client";
import type { Referral } from "@/api/client";
import ContactFilterPicker from "./ContactFilterPicker";

interface Props {
  onSelectionChange: (ids: string[], referrals: Referral[]) => void;
  initialSelection?: string[];
}

export default function ReferralFilterPicker(props: Props) {
  return (
    <ContactFilterPicker<Referral>
      fetchFn={getReferrals}
      entityLabel="referrals"
      {...props}
    />
  );
}
