import { format } from 'date-fns';

/** Renders an ISO timestamp as a plain `yyyy-MM-dd` day, or `—` when absent. */
export function formatDay(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : format(date, 'yyyy-MM-dd');
}
