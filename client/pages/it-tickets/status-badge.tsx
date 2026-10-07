import { useTranslation } from '@nocobase/i18n/client';
import type { ComponentProps, ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { ItTicketStatus } from './types.js';

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>['variant']>;

/**
 * A status is rendered as a badge whose tone follows the meaning, so the list
 * is readable at a glance: waiting is quiet, being handled is the active tone,
 * and finished is outlined.
 */
const STATUS_VARIANTS: Readonly<Record<ItTicketStatus, BadgeVariant>> = {
  pending: 'secondary',
  processing: 'default',
  completed: 'outline',
};

export function ItTicketStatusBadge({
  status,
}: {
  readonly status: ItTicketStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANTS[status]}>
      {t(`itTickets.status.${status}`)}
    </Badge>
  );
}
