import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import type {
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from '../lib/it-service-desk-api.js';
import {
  priorityBadgeVariant,
  statusBadgeVariant,
} from '../lib/ticket-badge-variants.js';
import { Badge } from './ui/badge';

export function TicketStatusBadge({
  status,
}: {
  readonly status: TicketStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={statusBadgeVariant(status)}>
      {t(`itServiceDesk.statuses.${status}`)}
    </Badge>
  );
}

export function TicketPriorityBadge({
  priority,
}: {
  readonly priority: TicketPriority;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={priorityBadgeVariant(priority)}>
      {t(`itServiceDesk.priorities.${priority}`)}
    </Badge>
  );
}

export function TicketCategoryBadge({
  category,
}: {
  readonly category: TicketCategory;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant='outline'>{t(`itServiceDesk.categories.${category}`)}</Badge>
  );
}
