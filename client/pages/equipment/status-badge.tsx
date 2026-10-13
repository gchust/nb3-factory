import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import type { EquipmentStatus } from './types.js';

/** Equipment status; the label is a dynamic key, so every value in `EQUIPMENT_STATUSES` has a translation. */
export function EquipmentStatusBadge({
  status,
}: {
  readonly status: EquipmentStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={status === 'available' ? 'success' : 'warning'}>
      {t(`equipment.status.${status}`)}
    </StatusBadge>
  );
}
