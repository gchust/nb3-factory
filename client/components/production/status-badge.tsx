import type { ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import { Badge } from '@/components/ui/badge';
import type { WorkOrderStatus } from '@/lib/production-api';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const VARIANT_BY_STATUS: Record<WorkOrderStatus, BadgeVariant> = {
  pending: 'outline',
  in_production: 'default',
  completed: 'secondary',
  closed: 'outline',
};

export function WorkOrderStatusBadge({
  status,
}: {
  readonly status: WorkOrderStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={VARIANT_BY_STATUS[status] ?? 'outline'}>
      {t(`production.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}
