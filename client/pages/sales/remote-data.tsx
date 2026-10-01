import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Loading } from '@/components/loading';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export interface RemoteDataErrorProps {
  readonly reload: () => void;
}

/** A failed request with a retry button, shared by the list pages and the detail drawer. */
export function RemoteDataError({
  reload,
}: RemoteDataErrorProps): ReactElement {
  const { t } = useTranslation();

  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertTitle>{t('sales.error.listFailedTitle')}</AlertTitle>
      <AlertDescription>
        <span>{t('sales.error.listFailed')}</span>
        <Button type='button' variant='outline' size='sm' onClick={reload}>
          {t('status.retry')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export interface RemoteDataProps {
  readonly loading: boolean;
  readonly error: boolean;
  readonly reload: () => void;
  readonly children: ReactNode;
}

/**
 * Renders a loading state, a retryable failure, or the caller's content. Keeps
 * the three list pages from each repeating the same two states.
 */
export function RemoteData({
  loading,
  error,
  reload,
  children,
}: RemoteDataProps): ReactElement {
  if (loading) {
    return <Loading className='py-16' />;
  }
  if (error) {
    return <RemoteDataError reload={reload} />;
  }
  return <>{children}</>;
}
