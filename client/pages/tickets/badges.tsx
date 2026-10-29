import { useTranslation } from '@nocobase/i18n/client';
import { TriangleAlertIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import type { TicketPriority, TicketStatus } from './types.js';

const statusTones = {
  open: 'info',
  in_progress: 'warning',
  resolved: 'success',
  closed: 'neutral',
} as const;

const priorityTones = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'warning',
} as const;

export function TicketStatusBadge({
  status,
}: {
  readonly status: TicketStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge size='sm' tone={statusTones[status]}>
      {t(`tickets.status.${status}`)}
    </StatusBadge>
  );
}

export function TicketOverdueBadge({
  overdue,
}: {
  readonly overdue: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!overdue) return null;
  return (
    <StatusBadge size='sm' tone='warning'>
      <TriangleAlertIcon className='size-3' aria-hidden />
      {t('tickets.overdue')}
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
    <StatusBadge size='sm' tone={priorityTones[priority]}>
      {t(`tickets.priority.${priority}`)}
    </StatusBadge>
  );
}
