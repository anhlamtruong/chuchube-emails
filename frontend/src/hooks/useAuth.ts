/**
 * Thin wrapper around Clerk's useAuth hook.
 * Provides isSignedIn + signOut — the rest of auth is handled by ClerkProvider.
 */
export { useAuth, useUser } from "@clerk/clerk-react";
