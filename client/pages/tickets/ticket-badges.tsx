import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import type { TicketPriority, TicketState } from './types.js';

// The tone carries the meaning: waiting on the desk, in the engineer's hands, done, or filed away.
const STATUS_TONES = {
  submitted: 'warning',
  assigned: 'info',
  processing: 'info',
  resolved: 'success',
  closed: 'neutral',
} as const;

const PRIORITY_TONES = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'warning',
} as const;

export function TicketStatusBadge({
  status,
}: {
  readonly status: TicketState;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={STATUS_TONES[status]}>
      {t(`helpdesk.status.${status}`)}
    </StatusBadge>
  );
}

export function TicketPriorityBadge({
  priority,
}: {
  readonly priority: TicketPriority;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={PRIORITY_TONES[priority]}>
      {t(`helpdesk.priority.${priority}`)}
    </StatusBadge>
  );
}
