import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { TicketStatus } from './types.js';

const STATUS_VARIANT: Record<
  TicketStatus,
  'outline' | 'default' | 'secondary'
> = {
  pending: 'outline',
  in_progress: 'default',
  completed: 'secondary',
};

/** Ticket status. Shared by the list and the detail view so a given status looks the same everywhere. */
export function TicketStatusBadge({
  status,
}: {
  readonly status: TicketStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANT[status]}>
      {/* Dynamic key: every value in TICKET_STATUSES needs a translation in the locale files. */}
      {t(`tickets.status.${status}`)}
    </Badge>
  );
}
