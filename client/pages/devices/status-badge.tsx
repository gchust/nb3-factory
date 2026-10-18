import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import type { DeviceStatus } from './types.js';

/**
 * The borrowing status as a label. The stored value is never shown; the label follows the current language, so
 * switching language translates it while the record itself is untouched.
 */
export function DeviceStatusBadge({
  status,
}: {
  readonly status: DeviceStatus;
}): ReactElement {
  const { t } = useTranslation();
  const borrowed = status === 'borrowed';
  return (
    <StatusBadge tone={borrowed ? 'warning' : 'success'}>
      {borrowed ? t('devices.status.borrowed') : t('devices.status.available')}
    </StatusBadge>
  );
}
