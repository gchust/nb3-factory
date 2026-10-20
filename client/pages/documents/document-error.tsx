import { useTranslation } from '@nocobase/i18n/client';
import { Link } from 'react-router';

import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  documentErrorMessage,
  documentStatus,
} from './document-error-message.js';

export function DocumentError({
  error,
  retry,
}: {
  readonly error: unknown;
  readonly retry?: () => void;
}) {
  const { t } = useTranslation();
  const status = documentStatus(error);
  if (!error) return null;
  return (
    <Alert variant='destructive'>
      <AlertDescription>
        {documentErrorMessage(error, t)}
        {status === 401 ? (
          <Button
            variant='outline'
            nativeButton={false}
            render={<Link to='/login' />}
          >
            {t('documents.errors.signInAgain')}
          </Button>
        ) : status === 404 ? (
          <Button
            variant='outline'
            nativeButton={false}
            render={<Link to='/documents' />}
          >
            {t('documents.errors.backToList')}
          </Button>
        ) : retry ? (
          <Button variant='outline' size='sm' onClick={retry}>
            {t('documents.errors.retry')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
