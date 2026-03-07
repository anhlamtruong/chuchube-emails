import { createContactApi, type Contact } from "./contacts";

// Recruiter shares the Contact shape
export type Recruiter = Contact;

export const recruitersApi = createContactApi<Recruiter>("recruiters");

export const getRecruiters = recruitersApi.getAll;
export const getRecruiterCount = recruitersApi.getCount;
export const createRecruiter = recruitersApi.create;
export const updateRecruiter = recruitersApi.update;
export const deleteRecruiter = recruitersApi.delete;
