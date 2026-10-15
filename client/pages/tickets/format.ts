import type { TicketUrgency } from './types.js';

/** Whether a raw string is one of the ticket urgency values. */
export function isTicketUrgency(value: string): value is TicketUrgency {
  return (
    value === 'low' ||
    value === 'normal' ||
    value === 'high' ||
    value === 'urgent'
  );
}

/** A stable, locale-aware date-time; the list and the drawer show the same format. */
export function formatDateTime(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
