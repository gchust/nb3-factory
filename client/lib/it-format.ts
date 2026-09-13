import { ApiClientError } from '@nocobase/app-client';
import type { UseTranslationResponse } from '@nocobase/i18n/client';

type Translate = UseTranslationResponse<never, undefined>['t'];

const ERROR_KEYS: Record<string, string> = {
  ASSET_CODE_EXISTS: 'it.errors.assetCodeExists',
  ASSET_NOT_FOUND: 'it.errors.assetNotFound',
  ASSIGNMENT_ALREADY_OPEN: 'it.errors.assignmentAlreadyOpen',
  ASSIGNMENT_NOT_FOUND: 'it.errors.assignmentNotFound',
  WORK_ORDER_NOT_FOUND: 'it.errors.workOrderNotFound',
  INVALID_STATUS_TRANSITION: 'it.errors.invalidStatusTransition',
  INVALID_INPUT: 'it.errors.invalidInput',
  FORBIDDEN: 'it.errors.forbidden',
};

/**
 * Turn an API failure into a translated, user-facing sentence. Known business codes get a stable
 * translation; everything else falls back to the server message (or a generic failure string).
 */
export function describeError(t: Translate, cause: unknown): string {
  if (cause instanceof ApiClientError) {
    const key = cause.code ? ERROR_KEYS[cause.code] : undefined;
    if (key) return t(key);
    return cause.message;
  }
  if (cause instanceof Error && cause.message) return cause.message;
  return t('it.errors.generic');
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return String(value);
}

export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}
