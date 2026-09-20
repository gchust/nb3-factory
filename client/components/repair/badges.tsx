import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

const STATUS_VARIANTS: Readonly<
  Record<string, 'default' | 'secondary' | 'destructive' | 'outline'>
> = {
  pending_dispatch: 'destructive',
  assigned: 'secondary',
  in_progress: 'default',
  pending_acceptance: 'outline',
  rework: 'destructive',
  completed: 'default',
  cancelled: 'secondary',
};

export function StatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? 'outline'} data-status={status}>
      {t(`repair.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

const PRIORITY_VARIANTS: Readonly<
  Record<string, 'default' | 'secondary' | 'destructive' | 'outline'>
> = {
  low: 'secondary',
  normal: 'outline',
  high: 'default',
  urgent: 'destructive',
};

export function PriorityBadge({
  priority,
}: {
  readonly priority: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge
      variant={PRIORITY_VARIANTS[priority] ?? 'outline'}
      data-priority={priority}
    >
      {t(`repair.priority.${priority}`, { defaultValue: priority })}
    </Badge>
  );
}
