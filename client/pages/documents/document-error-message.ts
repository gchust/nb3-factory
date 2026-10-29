import { ApiClientError } from '@nocobase/app-client';

export function documentStatus(error: unknown): number | undefined {
  return error instanceof ApiClientError
    ? error.status
    : typeof error === 'object' && error !== null
      ? Number(Reflect.get(error, 'status')) || undefined
      : undefined;
}

export function documentErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (error instanceof ApiClientError) {
    switch (error.reason) {
      case 'DOCUMENT_NOT_FOUND':
        return t('documents.errors.missing');
      case 'DOCUMENT_CONFIDENTIAL':
        return t('documents.errors.confidential');
      case 'DOCUMENT_SHARE_TARGET_UNAVAILABLE':
        return t('documents.errors.targetUnavailable');
      case 'DOCUMENT_SHARE_SELF':
        return t('documents.errors.selfShare');
      case 'DOCUMENT_PERMISSION_DENIED':
        return t('documents.errors.denied');
    }
  }
  if (documentStatus(error) === 403) return t('documents.errors.denied');
  if (documentStatus(error) === 404) return t('documents.errors.missing');
  return t('documents.errors.failed');
}
