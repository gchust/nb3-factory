import { ApiClientError } from '@nocobase/app-client';

export function expenseErrorMessage(error: unknown, fallback: string): string {
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
