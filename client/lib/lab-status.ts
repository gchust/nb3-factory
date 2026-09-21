/**
 * The tone a status is painted in.
 *
 * One mapping for the whole application: the same state reads the same way in a table cell, a
 * dashboard card and a detail page, and a state that gains a tone does not have to be found in six
 * files to be changed.
 */

export type BadgeTone = 'default' | 'secondary' | 'destructive' | 'outline';

const TONES: Record<string, BadgeTone> = {
  // Laboratory and equipment availability.
  active: 'default',
  inactive: 'outline',
  available: 'default',
  in_use: 'secondary',
  maintenance: 'destructive',
  retired: 'outline',
  // Calibration.
  passed: 'default',
  failed: 'destructive',
  // Work orders.
  open: 'destructive',
  assigned: 'secondary',
  in_progress: 'secondary',
  pending_review: 'default',
  completed: 'outline',
  cancelled: 'outline',
  // Priorities and severities share a vocabulary.
  low: 'outline',
  normal: 'secondary',
  high: 'destructive',
  critical: 'destructive',
  medium: 'outline',
  // Safety.
  pending: 'secondary',
  pass: 'default',
  issue: 'destructive',
  closed: 'outline',
  // Reservations.
  reserved: 'secondary',
  // Attachment purposes are not states; the fallback covers them.
};

export function statusTone(value: string | null | undefined): BadgeTone {
  if (!value) return 'outline';
  return TONES[value] ?? 'secondary';
}

/**
 * How an expired calibration is shown.
 *
 * Expiry is a date comparison rather than a stored state, so it is painted from the boolean the
 * server computed instead of from a status value.
 */
export function calibrationTone(
  expired: boolean,
  expiringSoon: boolean,
): BadgeTone {
  if (expired) return 'destructive';
  if (expiringSoon) return 'secondary';
  return 'default';
}
