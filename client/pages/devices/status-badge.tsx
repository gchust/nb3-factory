import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import type { DeviceStatus } from './types.js';

// Chosen by meaning: an available device is the good state, a borrowed one waits to come back.
const tones = {
  available: 'success',
  borrowed: 'warning',
} as const;

/** The device's status as a quiet badge, shared by the list and the form so a status looks the same everywhere. */
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
