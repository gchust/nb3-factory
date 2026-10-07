/** Formatting helpers shared by the collaboration pages. They hold no React and no state. */

import { resolveAppUrl } from '@nocobase/app-client';

/** A person's readable name, in the order the account prefers to be named. */
export function collaboratorName(person: {
  readonly name: string | null;
  readonly username?: string | null;
  readonly email?: string | null;
}): string {
  return person.name ?? person.username ?? person.email ?? '—';
}

/** The URL that streams a deliverable's bytes, gated by the application's own access check. */
export function deliverableContentUrl(
  deliverableId: string,
  download = false,
): string {
  const query = download ? '?download=1' : '';
  return resolveAppUrl(
    `/deliverables/${encodeURIComponent(deliverableId)}/content${query}`,
  );
}

/** A date-only ISO string (`2026-01-20`) or a full ISO instant, formatted in the current language. */
export function formatDate(
  value: string | null | undefined,
  locale?: string,
): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(
  value: string | null | undefined,
  locale?: string,
): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/** The number a person reads for a task count in `completed/total` form. */
export function countLabel(completed: number, total: number): string {
  return `${completed}/${total}`;
}

/** Human-readable size for a delivered file. */
export function formatBytes(value: string | null | undefined): string {
  if (!value) return '';
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}
