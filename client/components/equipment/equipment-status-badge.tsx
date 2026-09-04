import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

import type { EquipmentStatus } from './types.js';

const STATUS_STYLES: Record<
  EquipmentStatus,
  { className: string; labelKey: string }
> = {
  available: {
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    labelKey: 'equipment.status.available',
  },
  borrowed: {
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    labelKey: 'equipment.status.borrowed',
  },
  repairing: {
    className: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
    labelKey: 'equipment.status.repairing',
  },
};

export function EquipmentStatusBadge({
  status,
}: {
  readonly status: EquipmentStatus;
}): ReactElement {
  const { t } = useTranslation();
  const style = STATUS_STYLES[status];

  return <Badge className={style.className}>{t(style.labelKey)}</Badge>;
}
