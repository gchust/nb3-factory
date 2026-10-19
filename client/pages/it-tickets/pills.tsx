import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';
import { Badge } from '#components/ui/badge';

import { statusLabel, urgencyLabel, type TFunction } from './labels.js';
import type { TicketStatus, TicketUrgency } from './types.js';

const STATUS_TONES = {
  pending: 'warning',
  in_progress: 'info',
  resolved: 'success',
  closed: 'neutral',
} as const;

const URGENCY_TONES = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  critical: 'warning',
} as const;

export function StatusPill({
  status,
  t,
}: {
  readonly status: TicketStatus;
  readonly t: TFunction;
}): ReactElement {
  return (
    <StatusBadge tone={STATUS_TONES[status]}>
      {statusLabel(t, status)}
    </StatusBadge>
  );
}

export function UrgencyPill({
  urgency,
  t,
}: {
  readonly urgency: TicketUrgency;
  readonly t: TFunction;
}): ReactElement {
  if (urgency === 'critical') {
    return <Badge variant='destructive'>{urgencyLabel(t, urgency)}</Badge>;
  }
  return (
    <StatusBadge tone={URGENCY_TONES[urgency]}>
      {urgencyLabel(t, urgency)}
    </StatusBadge>
  );
}
