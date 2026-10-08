import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/**
 * Shown where a request failed with 401: the session ended, so a retry cannot
 * succeed. The user starts `refresh()`, never an effect or a catch, so the
 * signed-in pages and any unsaved input are not torn down behind their back.
 */
export function SessionExpiredAlert(): ReactElement {
  const { t } = useTranslation();
  const { refresh } = useAuthentication();
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertDescription>{t('status.sessionExpired')}</AlertDescription>
      <AlertAction>
        <Button variant='outline' size='sm' onClick={() => void refresh()}>
          {t('actions.signInAgain')}
        </Button>
      </AlertAction>
    </Alert>
  );
}

/** A failed load that is not a session problem, with a retry the user can trigger. */
export function LoadFailedAlert(inputProps: {
  readonly message: string;
  readonly onRetry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertDescription>{inputProps.message}</AlertDescription>
      {inputProps.onRetry ? (
        <AlertAction>
          <Button variant='outline' size='sm' onClick={inputProps.onRetry}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

/** A centered spinner sized for a page-sized wait. */
export function LoadingBlock(): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex items-center justify-center gap-2 py-12 text-muted-foreground'>
      <Spinner />
      <span>{t('status.loading')}</span>
    </div>
  );
}
