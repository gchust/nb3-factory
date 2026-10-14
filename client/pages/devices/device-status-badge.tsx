import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import type { DeviceStatus } from './types.js';

const tones = {
  available: 'success',
  borrowed: 'info',
} as const;

/** Renders the stored status code in the current language; the code itself is never shown. */
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
