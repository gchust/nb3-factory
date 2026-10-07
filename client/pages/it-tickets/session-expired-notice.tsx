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
 * Shown in place of a form or a page when a request comes back `401`: the
 * session has ended, and nothing the user types here would be stored. Reading
 * the session again is what sends them to the sign-in page.
 */
export function SessionExpiredNotice(): ReactElement {
  const { t } = useTranslation();
  const { refresh } = useAuthentication();
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertTitle>{t('itTickets.error.title')}</AlertTitle>
      <AlertDescription>{t('itTickets.error.sessionExpired')}</AlertDescription>
      <AlertAction>
        <Button variant='outline' size='sm' onClick={() => void refresh()}>
          {t('itTickets.error.signInAgain')}
        </Button>
      </AlertAction>
    </Alert>
  );
}
