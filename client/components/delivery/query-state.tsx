import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, ReactNode } from 'react';

import { Loading } from '@/components/loading';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export interface DeliveryQueryStateProps {
  readonly loading: boolean;
  readonly error?: string;
  readonly onRetry: () => void;
  readonly children: ReactNode;
}

export function DeliveryQueryState({
  loading,
  error,
  onRetry,
  children,
}: DeliveryQueryStateProps): ReactElement {
  const { t } = useTranslation();
  if (loading) {
    return (
      <Loading
        className='min-h-48'
        label={t('status.loadingPage', { defaultValue: 'Loading page' })}
      />
    );
  }
  if (error) {
    return (
      <Alert variant='destructive'>
        <AlertTitle>{t('delivery.error.title')}</AlertTitle>
        <AlertDescription className='space-y-3'>
          <p>{error}</p>
          <Button onClick={onRetry} size='sm' variant='outline'>
            {t('status.retry', { defaultValue: 'Retry' })}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return <>{children}</>;
}
