import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import type { DeviceStatus } from './types.js';

/** A device's status as text in a badge; the list and the form's summary use the same one. */
export function DeviceStatusBadge({
  status,
}: {
  readonly status: DeviceStatus;
}): ReactElement {
  const { t } = useTranslation();
  const available = status === 'available';
  return (
    <StatusBadge tone={available ? 'success' : 'warning'}>
      {available ? t('devices.status.available') : t('devices.status.borrowed')}
    </StatusBadge>
  );
}
