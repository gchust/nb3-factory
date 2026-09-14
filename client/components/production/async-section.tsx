import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { ShieldAlertIcon, TriangleAlertIcon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/loading';
import { translateError } from '@/lib/production-messages';

export interface AsyncSectionProps {
  readonly status: 'loading' | 'ready' | 'error';
  readonly error?: unknown;
  readonly onRetry?: () => void;
  /** Renders a permission denial instead of a generic failure, for an expected 403. */
  readonly denied?: boolean;
  readonly children: ReactNode;
}

export function AsyncSection({
  status,
  error,
  onRetry,
  denied,
  children,
}: AsyncSectionProps): ReactElement {
  const { t } = useTranslation();
  if (status === 'loading') {
    return <Loading className='py-16' label={t('production.common.loading')} />;
  }
  if (status === 'error' && denied) {
    return (
      <Alert>
        <ShieldAlertIcon />
        <AlertTitle>{t('production.common.deniedTitle')}</AlertTitle>
        <AlertDescription>
          <p>{translateError(t, error)}</p>
        </AlertDescription>
      </Alert>
    );
  }
  if (status === 'error') {
    return (
      <Alert variant='destructive'>
        <TriangleAlertIcon />
        <AlertTitle>{t('production.common.errorTitle')}</AlertTitle>
        <AlertDescription>
          <p>{translateError(t, error)}</p>
          {onRetry ? (
            <Button
              className='mt-2'
              onClick={onRetry}
              size='sm'
              variant='outline'
            >
              {t('production.common.retry')}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }
  return <>{children}</>;
}
