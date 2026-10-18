import type { OccurrenceStatus } from './types.js';

/** The badge tone for one occurrence, chosen by what the status means rather than by its spelling. */
export function occurrenceTone(
  status: OccurrenceStatus,
): 'neutral' | 'info' | 'warning' | 'success' {
  switch (status) {
    case 'succeeded':
      return 'success';
    // Both are a run that did not finish: they need attention even though neither is reversible.
    case 'failed':
    case 'timed_out':
      return 'warning';
    case 'pending':
    case 'running':
    case 'waiting':
    case 'triggered':
      return 'info';
    case 'skipped':
    case 'cancelled':
      return 'neutral';
  }
}
