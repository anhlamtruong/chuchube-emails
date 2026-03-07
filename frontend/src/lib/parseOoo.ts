/**
 * Parse OOO (Out of Office) notes from a contact's notes field.
 *
 * The bounce scanner prepends lines like:
 *   [OOO 2026-03-01] I'm out of office until March 5th.
 *
 * This utility extracts the first OOO entry.
 */
export interface OooNote {
  date: string;
  message: string;
  raw: string;
}

const OOO_RE = /^\[OOO\s+(\d{4}-\d{2}-\d{2})\]\s*(.+)$/m;

export function parseOooNote(notes: string | null | undefined): OooNote | null {
  if (!notes) return null;
  const m = OOO_RE.exec(notes);
  if (!m) return null;
  return {
    date: m[1],
    message: m[2].trim(),
    raw: m[0],
  };
}

export function hasOooNote(notes: string | null | undefined): boolean {
  return notes ? OOO_RE.test(notes) : false;
}
