import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { TicketStatus } from './types.js';

/** The color a status is painted with. A badge's shade is presentation; the status itself is the text. */
const STATUS_VARIANT: Record<
  TicketStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  pending: 'outline',
  in_progress: 'default',
  completed: 'secondary',
};

/** A ticket's status, shown as a badge wherever the status appears. */
export function TicketStatusBadge({
  status,
}: {
  readonly status: TicketStatus;
}): ReactElement {
  const { t } = useTranslation();

  return (
    <Badge variant={STATUS_VARIANT[status]}>
      {t(`itTickets.status.${status}`)}
    </Badge>
  );
}
