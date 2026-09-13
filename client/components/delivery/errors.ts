import { useTranslation } from '@nocobase/i18n/client';

import { deliveryErrorMessage } from './delivery-api.js';

const ERROR_KEYS: Record<string, string> = {
  DELIVERY_VALIDATION: 'delivery.errors.validation',
  DELIVERY_DUPLICATE_TIMESHEET: 'delivery.errors.duplicateTimesheet',
  DELIVERY_TASK_LOCKED: 'delivery.errors.taskLocked',
  DELIVERY_FORBIDDEN: 'delivery.errors.forbidden',
  DELIVERY_NOT_FOUND: 'delivery.errors.notFound',
  DELIVERY_TASK_HAS_TIMESHEETS: 'delivery.errors.taskHasTimesheets',
  DELIVERY_FILE_TOO_LARGE: 'delivery.errors.fileTooLarge',
  DELIVERY_FILE_REQUIRED: 'delivery.errors.fileRequired',
};

type Translate = (key: string) => string;

export function errorText(t: Translate, error: unknown): string {
  const code = deliveryErrorMessage(error);
  const key = ERROR_KEYS[code];
  return key ? t(key) : t('delivery.errors.unknown');
}

export function useDeliveryErrorText(): (error: unknown) => string {
  const { t } = useTranslation();
  return (error: unknown) => errorText(t, error);
}
