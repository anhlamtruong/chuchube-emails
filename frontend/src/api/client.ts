/**
 * Barrel re-export — keeps every existing `import { X } from "../api/client"`
 * working without changes.  The actual code now lives in domain modules.
 */

// Axios instance + Clerk token setup
export { default } from "./instance";
export { setClerkTokenGetter } from "./instance";

// Shared types
export type { Paginated } from "./types";

// Domain modules — re-export everything
export * from "./contacts";
export * from "./dashboard";
export * from "./recruiters";
export * from "./referrals";
export * from "./campaigns";
export * from "./templates";
export * from "./emails";
export * from "./importExport";
export * from "./clipboard";
export * from "./documents";
export * from "./settings";
export * from "./consent";
export * from "./auth";
export * from "./admin";
export * from "./bounces";
