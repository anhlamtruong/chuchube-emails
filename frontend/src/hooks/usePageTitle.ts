import { useEffect } from "react";

const APP_NAME = "ChuChube Emails";

/**
 * Sets document.title to `<page> — ChuChobe Emails` while mounted,
 * and restores the base title on unmount.
 */
export function usePageTitle(page?: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = page ? `${page} — ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = prev;
    };
  }, [page]);
}
