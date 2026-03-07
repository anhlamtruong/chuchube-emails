import { createContactApi, type Contact } from "./contacts";

// Referral shares the Contact shape
export type Referral = Contact;

export const referralsApi = createContactApi<Referral>("referrals");

export const getReferrals = referralsApi.getAll;
export const getReferralCount = referralsApi.getCount;
export const createReferral = referralsApi.create;
export const updateReferral = referralsApi.update;
export const deleteReferral = referralsApi.delete;
