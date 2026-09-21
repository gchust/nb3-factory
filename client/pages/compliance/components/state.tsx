import { useTranslation } from '@nocobase/i18n/client';
import { AlertTriangleIcon, ShieldXIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { errorMessageKey, type NormalizedError } from '../api.js';

export function LoadingState(): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className='flex items-center gap-2 py-10 text-muted-foreground'
      role='status'
    >
      <Spinner />
      {t('status.loading', { defaultValue: 'Loading' })}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  readonly error: NormalizedError;
  readonly onRetry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className='flex flex-col items-center gap-3 py-10 text-center'
      role='alert'
    >
      <AlertTriangleIcon className='size-8 text-destructive' />
      <p className='text-sm'>
        {t(errorMessageKey(error), { defaultValue: error.message })}
      </p>
      {onRetry ? (
        <Button variant='outline' size='sm' onClick={onRetry}>
          {t('compliance.preview.retry', { defaultValue: 'Retry' })}
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <p className='py-8 text-center text-sm text-muted-foreground'>{children}</p>
  );
}

export function AccessDenied({
  message,
}: { readonly message?: string } = {}): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className='flex flex-col items-center gap-3 py-10 text-center'
      role='alert'
    >
      <ShieldXIcon className='size-8 text-muted-foreground' />
      <p className='text-sm text-muted-foreground'>
        {message ??
          t('compliance.error.forbidden', {
            defaultValue: 'You do not have permission to view this page.',
          })}
      </p>
    </div>
  );
}
