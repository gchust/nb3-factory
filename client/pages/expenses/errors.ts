import { ApiClientError } from '@nocobase/app-client';

/**
 * Server error codes the user can trigger from the interface, mapped to the
 * locale key that explains them. Falling back to the server's own English
 * message would break the application's all-Chinese default, so known codes are
 * translated and anything unknown keeps the server text.
 */
const ERROR_KEYS: Readonly<Record<string, string>> = {
  ALREADY_PAID: 'expenses.errors.ALREADY_PAID',
  CATEGORY_REQUIRED: 'expenses.errors.CATEGORY_REQUIRED',
  EMPLOYEE_NOT_FOUND: 'expenses.errors.EMPLOYEE_NOT_FOUND',
  EMPTY_REPORT: 'expenses.errors.EMPTY_REPORT',
  FILE_ALREADY_LINKED: 'expenses.errors.FILE_ALREADY_LINKED',
  FORBIDDEN: 'expenses.errors.FORBIDDEN',
  INVALID_AMOUNT: 'expenses.errors.INVALID_AMOUNT',
  INVALID_BODY: 'expenses.errors.INVALID_BODY',
  INVALID_DATE: 'expenses.errors.INVALID_DATE',
  INVALID_FILE: 'expenses.errors.INVALID_FILE',
  INVALID_INPUT: 'expenses.errors.INVALID_INPUT',
  INVALID_ITEM: 'expenses.errors.INVALID_ITEM',
  INVALID_STATE: 'expenses.errors.INVALID_STATE',
  ITEMS_REQUIRED: 'expenses.errors.ITEMS_REQUIRED',
  NOT_APPROVED: 'expenses.errors.NOT_APPROVED',
  NOT_FOUND: 'expenses.errors.NOT_FOUND',
  NO_DEPARTMENT: 'expenses.errors.NO_DEPARTMENT',
  NO_MANAGER: 'expenses.errors.NO_MANAGER',
  REASON_REQUIRED: 'expenses.errors.REASON_REQUIRED',
  SELF_APPROVAL_FORBIDDEN: 'expenses.errors.SELF_APPROVAL_FORBIDDEN',
  UNAUTHORIZED: 'expenses.errors.UNAUTHORIZED',
};

export function expenseErrorMessage(
  error: unknown,
  fallback: string,
  translate?: (key: string) => string,
): string {
  if (translate) {
    const code = expenseErrorCode(error);
    const key = code ? ERROR_KEYS[code] : undefined;
    if (key) {
      const localized = translate(key);
      if (localized && localized !== key) return localized;
    }
  }
  if (error instanceof ApiClientError) {
    const payload = error.payload;
    if (isRecord(payload)) {
      const nested = payload.error;
      if (isRecord(nested) && typeof nested.message === 'string') {
        return nested.message;
      }
      if (typeof payload.message === 'string') {
        return payload.message;
      }
    }
    if (error.message) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function expenseErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiClientError)) return null;
  const payload = error.payload;
  if (isRecord(payload)) {
    const nested = payload.error;
    if (isRecord(nested) && typeof nested.code === 'string') {
      return nested.code;
    }
  }
  return typeof error.code === 'string' ? error.code : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
