import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Link } from 'react-router';
import type { ReactElement } from 'react';

import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';

function statusOf(error: unknown): number | undefined {
  return error instanceof ApiClientError ? error.status : undefined;
}

function messageKey(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.reason === 'DEVICE_CODE_TAKEN' || error.status === 409) {
      return 'devices.error.conflict';
    }
    switch (error.status) {
      case 400:
      case 422:
        return 'devices.error.validation';
      case 401:
        return 'devices.error.sessionExpired';
      case 403:
        return 'devices.error.forbidden';
      case 404:
        return 'devices.error.notFound';
    }
  }
  if (error instanceof TypeError) {
    return 'devices.error.requestFailed';
  }
  return 'devices.error.requestFailed';
}

/** Why a device request failed, in the reader's language rather than the API's reason code. */
export function DeviceErrorAlert({
  error,
  retry,
}: {
  readonly error: unknown;
  readonly retry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const status = statusOf(error);
  return (
    <Alert variant='destructive'>
      <AlertDescription>
        <div className='flex flex-wrap items-center gap-3'>
          <span>{t(messageKey(error))}</span>
          {status === 401 ? (
            <Button
              variant='outline'
              size='sm'
              nativeButton={false}
              render={<Link to='/login' />}
            >
              {t('devices.error.signIn')}
            </Button>
          ) : retry && ![403, 404, 409].includes(status ?? 0) ? (
            <Button variant='outline' size='sm' onClick={retry}>
              {t('devices.error.retry')}
            </Button>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}
