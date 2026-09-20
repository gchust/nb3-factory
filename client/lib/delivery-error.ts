import { useTranslation } from '@nocobase/i18n/client';
import { useCallback } from 'react';

import { DeliveryApiError } from '@/lib/delivery-api';

/**
 * Server validation failures carry a stable code. The interface wording for
 * each code lives in the locale files, so a business rule ("the milestone
 * allocation cannot exceed the contract amount") reads in the language the
 * person selected rather than in the language the API answered in. A code with
 * no translation falls back to the server's own message, so a new rule is never
 * silent.
 */
const ERROR_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  INVALID_AMOUNT: 'delivery.errors.INVALID_AMOUNT',
  NEGATIVE_AMOUNT: 'delivery.errors.NEGATIVE_AMOUNT',
  REQUIRED_FIELD: 'delivery.errors.REQUIRED_FIELD',
  FIELD_TOO_LONG: 'delivery.errors.FIELD_TOO_LONG',
  DUPLICATE_CUSTOMER_CODE: 'delivery.errors.DUPLICATE_CUSTOMER_CODE',
  DUPLICATE_CONTRACT_NO: 'delivery.errors.DUPLICATE_CONTRACT_NO',
  AMOUNT_BELOW_ALLOCATION: 'delivery.errors.AMOUNT_BELOW_ALLOCATION',
  ALLOCATION_EXCEEDS_CONTRACT: 'delivery.errors.ALLOCATION_EXCEEDS_CONTRACT',
  INVALID_STATUS: 'delivery.errors.INVALID_STATUS',
  INVALID_TRANSITION: 'delivery.errors.INVALID_TRANSITION',
  DUPLICATE_MEMBER: 'delivery.errors.DUPLICATE_MEMBER',
  MILESTONE_ACCEPTED: 'delivery.errors.MILESTONE_ACCEPTED',
  FILES_REQUIRED: 'delivery.errors.FILES_REQUIRED',
  VERSION_WITHDRAWN: 'delivery.errors.VERSION_WITHDRAWN',
  ALREADY_APPROVED: 'delivery.errors.ALREADY_APPROVED',
  REASON_REQUIRED: 'delivery.errors.REASON_REQUIRED',
  NOT_PENDING: 'delivery.errors.NOT_PENDING',
  MILESTONE_NOT_ACCEPTED: 'delivery.errors.MILESTONE_NOT_ACCEPTED',
  ZERO_AMOUNT: 'delivery.errors.ZERO_AMOUNT',
  OVERPAYMENT: 'delivery.errors.OVERPAYMENT',
  INVALID_METHOD: 'delivery.errors.INVALID_METHOD',
  UNKNOWN_FILE_KIND: 'delivery.errors.UNKNOWN_FILE_KIND',
  TOO_MANY_FILES: 'delivery.errors.TOO_MANY_FILES',
  UNKNOWN_FILE: 'delivery.errors.UNKNOWN_FILE',
  FILE_TOO_LARGE: 'delivery.errors.FILE_TOO_LARGE',
  FILE_ALREADY_LINKED: 'delivery.errors.FILE_ALREADY_LINKED',
  FORBIDDEN: 'delivery.errors.FORBIDDEN',
  NOT_FOUND: 'delivery.errors.NOT_FOUND',
};

/** The server message, for a failure that carries no code or an unknown one. */
export function rawErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The locale key for a delivery error code, or `undefined` when the code has no
 * wording yet. Exported so the mapping can be checked without rendering.
 */
export function deliveryErrorKey(code: string): string | undefined {
  return ERROR_MESSAGE_KEYS[code];
}

/**
 * Translate one failure for display. Returns the server wording unchanged when
 * the failure is not a coded delivery error, so an unexpected problem still
 * surfaces instead of being replaced with a generic sentence.
 */
export function useDeliveryErrorMessage(): (error: unknown) => string {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown): string => {
      const fallback = rawErrorMessage(error);
      const key =
        error instanceof DeliveryApiError
          ? deliveryErrorKey(error.code)
          : undefined;
      return key ? t(key, { defaultValue: fallback }) : fallback;
    },
    [t],
  );
}
