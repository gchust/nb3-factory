import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { StatusBadge } from '#components/status-badge';

/** The label tone that matches each ticket status; the status word comes from the `tickets.status` translation group. */
const statusTones = {
  pending: 'warning',
  processing: 'info',
  resolved: 'success',
  closed: 'neutral',
} as const;

const urgencyTones = {
  low: 'neutral',
  normal: 'info',
  high: 'warning',
  urgent: 'warning',
} as const;

export function TicketStatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  const tone = statusTones[status as keyof typeof statusTones] ?? 'neutral';
  return (
    <StatusBadge tone={tone}>
      {t(`tickets.status.${status}`, { defaultValue: status })}
    </StatusBadge>
  );
}

export function TicketUrgencyBadge({
  urgency,
}: {
  readonly urgency: string;
}): ReactElement {
  const { t } = useTranslation();
  const tone = urgencyTones[urgency as keyof typeof urgencyTones] ?? 'neutral';
  return (
    <StatusBadge tone={tone}>
      {t(`tickets.urgency.${urgency}`, { defaultValue: urgency })}
    </StatusBadge>
  );
}
