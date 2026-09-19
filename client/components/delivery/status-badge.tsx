import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export type DeliveryStatusKind =
  'project' | 'milestone' | 'task' | 'submission' | 'priority' | 'role';

const VARIANTS: Readonly<Record<string, BadgeVariant>> = {
  active: 'default',
  on_hold: 'secondary',
  completed: 'default',
  pending: 'secondary',
  in_progress: 'secondary',
  submitted: 'secondary',
  todo: 'outline',
  done: 'default',
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
  approved: 'default',
  returned: 'destructive',
  manager: 'default',
  member: 'outline',
};

export interface DeliveryStatusBadgeProps {
  readonly kind: DeliveryStatusKind;
  readonly value: string;
}

export function DeliveryStatusBadge({
  kind,
  value,
}: DeliveryStatusBadgeProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={VARIANTS[value] ?? 'outline'}>
      {t(`delivery.status.${kind}.${value}`, { defaultValue: value })}
    </Badge>
  );
}
