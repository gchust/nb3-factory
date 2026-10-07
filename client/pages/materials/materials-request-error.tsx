import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { TriangleAlert } from 'lucide-react';
import type { ReactElement } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export interface MaterialsRequestErrorProps {
  readonly error: unknown;
  readonly onRetry?: () => void;
}

/** The three failures these pages tell apart, without ever showing the raw backend message. */
export function MaterialsRequestError({
  error,
  onRetry,
}: MaterialsRequestErrorProps): ReactElement {
  const { t } = useTranslation();
  const unauthenticated =
    error instanceof ApiClientError && error.status === 401;
  const forbidden = error instanceof ApiClientError && error.status === 403;
  const notFound = error instanceof ApiClientError && error.status === 404;
  const description = unauthenticated
    ? t('materials.error.unauthenticated')
    : forbidden
      ? t('materials.error.forbidden')
      : notFound
        ? t('materials.error.notFound')
        : t('materials.error.requestFailed');

  return (
    <Alert variant='destructive'>
      <TriangleAlert />
      <AlertTitle>{t('materials.error.title')}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      {onRetry && !unauthenticated && !forbidden && !notFound ? (
        <Button variant='outline' size='sm' onClick={onRetry}>
          {t('materials.error.retry')}
        </Button>
      ) : null}
    </Alert>
  );
}
