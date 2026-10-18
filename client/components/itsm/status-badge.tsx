import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import type { TicketStatus, TicketUrgency } from '#hooks/itsm';

const statusTones = {
  pending: 'warning',
  processing: 'info',
  resolved: 'success',
  closed: 'neutral',
} as const;

const urgencyTones = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'warning',
} as const;

/** The ticket's workflow state, in the tone its meaning calls for. */
export function TicketStatusBadge({
  status,
}: {
  readonly status: TicketStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={statusTones[status]}>
      {t(`tickets.status.${status}`)}
    </StatusBadge>
  );
}

/** The ticket's urgency, named rather than encoded in colour alone. */
export function TicketUrgencyBadge({
  urgency,
}: {
  readonly urgency: TicketUrgency;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={urgencyTones[urgency]}>
      {t(`tickets.urgency.${urgency}`)}
    </StatusBadge>
  );
}

/** A quiet marker for a ticket that has waited longer than the reminder window. */
export function TicketOverdueBadge(): ReactElement {
  const { t } = useTranslation();
  return <StatusBadge tone='warning'>{t('tickets.overdue')}</StatusBadge>;
}
