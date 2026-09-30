import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { TicketStatus } from './types.js';

const STATUS_BADGE: Record<TicketStatus, 'secondary' | 'default' | 'outline'> =
  {
    pending: 'secondary',
    in_progress: 'default',
    completed: 'outline',
  };

/** The one place a ticket status is rendered, so it looks the same in the list and the drawer. */
export function TicketStatusBadge({
  status,
}: {
  readonly status: TicketStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_BADGE[status]}>
      {t(`tickets.status.${status}`)}
    </Badge>
  );
}
