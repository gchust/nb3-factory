import { ApiClientError } from '@nocobase/app-client';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

export interface ServerFieldError {
  readonly field: string;
  readonly message: string;
}

/**
 * The field errors of a 400 response. The server sends
 * `{ errors: [{ path: ['field'], message }] }`; anything else is ignored so a
 * proxy error page cannot be mistaken for a validation problem.
 */
export function serverFieldErrors(error: unknown): ServerFieldError[] {
  if (!(error instanceof ApiClientError)) {
    return [];
  }
  const payload = error.payload;
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const issues = (payload as { errors?: unknown }).errors;
  if (!Array.isArray(issues)) {
    return [];
  }
  return issues.flatMap((issue): ServerFieldError[] => {
    if (!issue || typeof issue !== 'object') {
      return [];
    }
    const message = (issue as { message?: unknown }).message;
    const path = (issue as { path?: unknown }).path;
    const field = Array.isArray(path) ? (path as unknown[])[0] : undefined;
    if (typeof message !== 'string' || typeof field !== 'string') {
      return [];
    }
    return [{ field, message }];
  });
}

/**
 * Places a 400 response's field errors on the form, and reports whether at
 * least one found a field. When none did, the caller shows a root error instead
 * of losing the failure.
 */
export function applyServerFieldErrors<TValues extends FieldValues>(
  setError: UseFormSetError<TValues>,
  error: unknown,
): boolean {
  const fieldErrors = serverFieldErrors(error);
  let applied = false;
  for (const fieldError of fieldErrors) {
    setError(
      fieldError.field as Path<TValues>,
      { message: fieldError.message },
      { shouldFocus: !applied },
    );
    applied = true;
  }
  return applied;
}
