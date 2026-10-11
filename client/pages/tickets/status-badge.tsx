import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

type Tone = 'neutral' | 'info' | 'warning' | 'success';

const STATUS_TONES: Record<string, Tone> = {
  pending: 'warning',
  processing: 'info',
  resolved: 'neutral',
  closed: 'success',
};

const URGENCY_TONES: Record<string, Tone> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'warning',
  urgent: 'warning',
};

/** The ticket's status, as text in a quiet badge; shared by the list, the dashboard and the detail page. */
export function TicketStatusBadge({
  status,
  className,
}: {
  readonly status: string;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={STATUS_TONES[status] ?? 'neutral'} className={className}>
      {t(`tickets.status.${status}`)}
    </StatusBadge>
  );
}

/** The reported urgency. */
export function TicketUrgencyBadge({
  urgency,
  className,
}: {
  readonly urgency: string;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge
      tone={URGENCY_TONES[urgency] ?? 'neutral'}
      className={className}
    >
      {t(`tickets.urgency.${urgency}`)}
    </StatusBadge>
  );
}

/** Marks a ticket neither closed nor resolved and untouched for over a day. */
export function TicketOverdueBadge(): ReactElement {
  const { t } = useTranslation();
  return <StatusBadge tone='warning'>{t('tickets.overdue')}</StatusBadge>;
}
