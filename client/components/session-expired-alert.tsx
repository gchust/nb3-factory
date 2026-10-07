import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { LogInIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * Shown in place of a loader's content when the API answers 401.
 *
 * The session ended or was revoked, and only signing in again can fix it, so there is no Retry. The button calls
 * `refresh()` from `useAuthentication()`: while it runs, `AuthenticationGuard` renders nothing, so the signed-in
 * pages unmount and `RequiredAuthentication` then sends the user to sign in. That is why the user starts it and no
 * effect or `catch` block ever calls it on its own.
 */
export function SessionExpiredAlert(): ReactElement {
  const { t } = useTranslation();
  const { refresh } = useAuthentication();

  return (
    <Alert variant='destructive'>
      <AlertTitle>{t('status.sessionExpiredTitle')}</AlertTitle>
      <AlertDescription>{t('status.sessionExpired')}</AlertDescription>
      <AlertAction>
        <Button variant='outline' size='sm' onClick={() => void refresh()}>
          <LogInIcon data-icon='inline-start' />
          {t('status.signInAgain')}
        </Button>
      </AlertAction>
    </Alert>
  );
}
