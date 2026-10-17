import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import type { DeviceStatus } from './types.js';

const tones: Record<DeviceStatus, 'success' | 'warning'> = {
  available: 'success',
  borrowed: 'warning',
};

/** A device's stored status, shown in the current language. */
export function DeviceStatusBadge({
  status,
}: {
  readonly status: DeviceStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={tones[status]}>
      {t(`devices.status.${status}`)}
    </StatusBadge>
  );
}
