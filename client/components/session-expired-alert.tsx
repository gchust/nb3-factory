import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';

/**
 * Shown where a request failed with 401: the session ended, so a retry cannot
 * succeed. The button re-reads the session; the authentication guard then
 * sends the user back to sign in.
 */
export function SessionExpiredAlert(): ReactElement {
  const { t } = useTranslation();
  const { refresh } = useAuthentication();
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertDescription>
        {t('itTickets.errors.sessionExpired')}
      </AlertDescription>
      <AlertAction>
        <Button variant='outline' size='sm' onClick={() => void refresh()}>
          {t('itTickets.actions.signInAgain')}
        </Button>
      </AlertAction>
    </Alert>
  );
}
