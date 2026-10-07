import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { TicketStatus, TicketUrgency } from './types.js';

const statusVariant = {
  pending: 'outline',
  processing: 'secondary',
  resolved: 'default',
  closed: 'secondary',
} as const;

const urgencyVariant = {
  low: 'outline',
  normal: 'secondary',
  high: 'default',
  urgent: 'destructive',
} as const;

export function TicketStatusBadge({
  status,
}: {
  readonly status: TicketStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={statusVariant[status]}>
      {t(`tickets.status.${status}`)}
    </Badge>
  );
}

export function TicketUrgencyBadge({
  urgency,
}: {
  readonly urgency: TicketUrgency;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={urgencyVariant[urgency]}>
      {t(`tickets.urgency.${urgency}`)}
    </Badge>
  );
}
