import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * What a page shows when a request answered 401: keep the user's input where they are and let them choose when to
 * sign in again, since refreshing the session blanks signed-in content.
 */
export function SessionExpiredAlert(): ReactElement {
  const { t } = useTranslation();
  const { refresh } = useAuthentication();
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertTitle>{t('status.sessionExpired')}</AlertTitle>
      <AlertDescription>
        {t('status.sessionExpiredDescription')}
      </AlertDescription>
      <AlertAction>
        <Button size='sm' variant='outline' onClick={() => void refresh()}>
          {t('actions.signInAgain')}
        </Button>
      </AlertAction>
    </Alert>
  );
}
