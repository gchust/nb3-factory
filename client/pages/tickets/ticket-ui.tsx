import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import type { TicketPriority, TicketStatus } from './types.js';
import { priorityTone, ticketStatusTone } from './ticket-format.js';

export function TicketStatusBadge({
  status,
}: {
  readonly status: TicketStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={ticketStatusTone(status)}>
      {t(`serviceDesk.status.${status}`)}
    </StatusBadge>
  );
}

export function PriorityBadge({
  priority,
}: {
  readonly priority: TicketPriority;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={priorityTone(priority)}>
      {t(`serviceDesk.priority.${priority}`)}
    </StatusBadge>
  );
}

export function OverdueBadge(): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone='warning'>{t('serviceDesk.ticket.overdue')}</StatusBadge>
  );
}
