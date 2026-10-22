import { ApiClientError } from '@nocobase/app-client';

/** A user-visible message for a failure, decided by the server's stable `reason` so it follows the current language. */
export function errorMessage(
  t: (key: string, options?: Record<string, unknown>) => string,
  error: unknown,
): string {
  if (error instanceof ApiClientError) {
    switch (error.reason) {
      case 'DEVICE_CODE_TAKEN':
        return t('devices.errors.codeTaken');
      case 'DEVICE_NOT_FOUND':
        return t('devices.errors.notFound');
      case 'INVALID_ARGUMENT':
        return t('devices.errors.invalid');
      case 'UNAUTHENTICATED':
        return t('devices.errors.sessionExpired');
      default:
        return t('devices.errors.unknown');
    }
  }
  return t('devices.errors.unknown');
}
