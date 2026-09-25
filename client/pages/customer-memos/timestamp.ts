/**
 * Parses a stored `createdAt` into the moment it names.
 *
 * SQLite keeps a `datetime` as the text it was given and hands back
 * `2026-09-25T02:34:49.978` — the same instant, with the trailing `Z` dropped.
 * `new Date` reads a date-time without a zone as *local* time, so the memo
 * would render at the wrong hour once the browser is not on UTC. A value that
 * already carries a zone (`Z` or an offset) is trusted as it is, so the helper
 * stays correct on a database that returns a full ISO timestamp.
 */
export function parseMemoTimestamp(value: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/u.test(value);
  return new Date(hasZone ? value : `${value}Z`);
}
