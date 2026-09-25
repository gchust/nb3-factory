import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { ServiceRequestResult, ServiceRequestStatus } from './types.js';

/**
 * Shared by the list and the detail drawer so a given acceptance state looks the
 * same everywhere (the two surfaces are read side by side after accepting).
 */
const STATUS_VARIANTS: Record<
  ServiceRequestStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  pending: 'secondary',
  processing: 'outline',
  accepted_normal: 'default',
  accepted_urgent: 'destructive',
};

export function ServiceRequestStatusBadge({
  status,
}: {
  readonly status: ServiceRequestStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANTS[status]}>
      {t(`serviceRequests.status.${status}`)}
    </Badge>
  );
}

export function ServiceRequestResultBadge({
  result,
}: {
  readonly result: ServiceRequestResult;
}): ReactElement {
  const { t } = useTranslation();
  if (!result) {
    return <span className='text-muted-foreground'>—</span>;
  }
  return (
    <Badge variant='outline'>{t(`serviceRequests.result.${result}`)}</Badge>
  );
}
