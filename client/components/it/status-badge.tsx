import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

type BadgeVariant =
  'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';

const ASSET_VARIANTS: Record<string, BadgeVariant> = {
  in_use: 'default',
  idle: 'secondary',
  repairing: 'outline',
  scrapped: 'destructive',
};

const WORK_ORDER_VARIANTS: Record<string, BadgeVariant> = {
  pending: 'secondary',
  in_progress: 'default',
  completed: 'outline',
  closed: 'ghost',
};

const PRIORITY_VARIANTS: Record<string, BadgeVariant> = {
  low: 'secondary',
  medium: 'default',
  high: 'destructive',
};

/**
 * Renders an enum value as a translated, colour-coded badge. Translation keys are grouped by kind so
 * the same stored value reads correctly wherever it appears.
 */
export function StatusBadge({
  value,
  kind,
}: {
  readonly value: string;
  readonly kind: 'assetStatus' | 'priority' | 'workOrderStatus';
}): ReactElement {
  const { t } = useTranslation();
  const variants =
    kind === 'assetStatus'
      ? ASSET_VARIANTS
      : kind === 'priority'
        ? PRIORITY_VARIANTS
        : WORK_ORDER_VARIANTS;
  return (
    <Badge variant={variants[value] ?? 'secondary'}>
      {t(`it.${kind}.${value}`, { defaultValue: value })}
    </Badge>
  );
}
