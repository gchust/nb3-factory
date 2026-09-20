import { useTranslation } from '@nocobase/i18n/client';
import { AlertTriangle, Inbox, RotateCcw } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorKey } from '@/lib/repair-api';

export interface DataStateProps {
  readonly loading: boolean;
  readonly error: unknown;
  readonly empty?: boolean;
  readonly onRetry?: () => void;
  readonly children: ReactNode;
}

/** Loading, failure, empty and content states for a page section. */
export function DataState({
  loading,
  error,
  empty = false,
  onRetry,
  children,
}: DataStateProps): ReactElement {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className='space-y-2' role='status' aria-live='polite'>
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className='h-12 w-full' />
        ))}
      </div>
    );
  }
  if (error) {
    const mapped = errorKey(error);
    return (
      <div
        className='flex flex-col items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm'
        role='alert'
      >
        <AlertTriangle aria-hidden='true' className='size-5 text-destructive' />
        <p>{t(mapped.key, { defaultValue: mapped.fallback })}</p>
        {onRetry ? (
          <Button type='button' variant='outline' size='sm' onClick={onRetry}>
            <RotateCcw aria-hidden='true' />
            {t('repair.actions.retry', { defaultValue: 'Retry' })}
          </Button>
        ) : null}
      </div>
    );
  }
  if (empty) {
    return (
      <div
        className='flex flex-col items-center gap-2 rounded-md border border-dashed p-8 text-sm text-muted-foreground'
        role='status'
      >
        <Inbox aria-hidden='true' className='size-5' />
        <p>{t('repair.empty', { defaultValue: 'Nothing to show yet.' })}</p>
      </div>
    );
  }
  return <>{children}</>;
}
