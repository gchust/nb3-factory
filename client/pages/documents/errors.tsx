import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { errorReason } from './api.js';

/** Turns the server's stable reason into the localized sentence a person can act on. */
export function DocumentError({
  error,
}: {
  readonly error: unknown;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!error) return null;
  let message: string;
  switch (errorReason(error)) {
    case 'DOCUMENTS_ACCESS_DENIED':
      message = t('documents.errors.accessDenied');
      break;
    case 'DOCUMENT_NOT_FOUND':
      message = t('documents.errors.notFound');
      break;
    case 'RECIPIENT_NOT_FOUND':
      message = t('documents.errors.recipientNotFound');
      break;
    case 'RECIPIENT_DISABLED':
      message = t('documents.errors.recipientDisabled');
      break;
    case 'CONFIDENTIAL_DOCUMENT':
      message = t('documents.errors.confidentialDocument');
      break;
    case 'INVALID_ARGUMENT':
      message = t('documents.errors.invalidInput');
      break;
    default:
      message =
        error instanceof ApiClientError && error.status === 400
          ? t('documents.errors.invalidInput')
          : t('documents.errors.unknown');
  }
  return (
    <p role='alert' className='text-sm text-destructive'>
      {message}
    </p>
  );
}
