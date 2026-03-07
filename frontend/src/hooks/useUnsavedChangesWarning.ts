import { useEffect } from "react";

/**
 * Warn users before losing unsaved changes.
 *
 * Shows the native browser "Leave site?" dialog on tab close / refresh.
 *
 * Note: In-app React Router navigation blocking requires a data router
 * (createBrowserRouter). Since this app uses <BrowserRouter>, only the
 * browser-native beforeunload guard is active.
 *
 * @param hasUnsavedChanges — whether the page currently has unsaved edits.
 * @param _message — reserved for future use with a data router.
 */
export function useUnsavedChangesWarning(
  hasUnsavedChanges: boolean,
  _message = "You have unsaved changes. Are you sure you want to leave?",
) {
  // Browser tab close / refresh
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore custom text but require returnValue to be set
      e.returnValue = _message;
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges, _message]);
}
