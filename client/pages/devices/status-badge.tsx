import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import type { DeviceStatus } from './types.js';

/** Status reads by meaning: an available device is free to take, a borrowed one is out and has to come back. */
const STATUS_TONE: Record<DeviceStatus, 'success' | 'warning'> = {
  available: 'success',
  borrowed: 'warning',
};

/** Device status. Shared by the list and the forms so a given status looks the same everywhere. */
export function DeviceStatusBadge({
  status,
}: {
  readonly status: DeviceStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={STATUS_TONE[status]}>
      {/* Dynamic key: every value in DEVICE_STATUSES needs a translation in the locale files. */}
      {t(`devices.status.${status}`)}
    </StatusBadge>
  );
}
