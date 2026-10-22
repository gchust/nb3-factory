import type { ReactElement } from 'react';

import { useTranslation } from '@nocobase/i18n/client';

import { StatusBadge } from '#components/status-badge';

import type { DeviceStatus } from './device-client.js';

/** A stored status is a system value, so it is always translated; the device's own fields never are. */
export function DeviceStatusBadge({
  status,
}: {
  readonly status: DeviceStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={status === 'available' ? 'success' : 'warning'}>
      {t(`devices.status.${status}`)}
    </StatusBadge>
  );
}
