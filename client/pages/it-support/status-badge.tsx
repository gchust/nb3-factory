import { useTranslation } from '@nocobase/i18n/client';
import { CircleCheckIcon, ClockIcon, LoaderIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import { isItTicketStatus, type ItTicketStatus } from './types.js';

const STATUS_VARIANT: Record<
  ItTicketStatus,
  'secondary' | 'default' | 'outline'
> = {
  pending: 'secondary',
  processing: 'default',
  completed: 'outline',
};

const STATUS_ICON: Record<ItTicketStatus, typeof ClockIcon> = {
  pending: ClockIcon,
  processing: LoaderIcon,
  completed: CircleCheckIcon,
};

/** A ticket's status as a badge whose label follows the current language. */
export function ItTicketStatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  if (!isItTicketStatus(status)) {
    return <Badge variant='outline'>{status}</Badge>;
  }
  const Icon = STATUS_ICON[status];
  return (
    <Badge variant={STATUS_VARIANT[status]}>
      <Icon data-icon='inline-start' />
      {t(`itSupport.status.${status}`)}
    </Badge>
  );
}
