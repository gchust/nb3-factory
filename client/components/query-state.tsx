import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, ReactNode } from 'react';

import { Loading } from '@/components/loading';
import { Button } from '@/components/ui/button';

export interface QueryStateProps {
  readonly loading: boolean;
  readonly error?: unknown;
  readonly isEmpty?: boolean;
  readonly onRetry?: () => void;
  readonly emptyTitle: string;
  readonly emptyDescription?: string;
  readonly children: ReactNode;
}

/** Shared loading, error and empty presentation for a data view. */
export function QueryState({
  loading,
  error,
  isEmpty = false,
  onRetry,
  emptyTitle,
  emptyDescription,
  children,
}: QueryStateProps): ReactElement {
  const { t } = useTranslation();

  if (loading) {
    return <Loading className='py-12' />;
  }

  if (error) {
    return (
      <div className='rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm'>
        <p className='font-medium text-destructive'>
          {t('rentals.loadFailed')}
        </p>
        <p className='mt-1 text-muted-foreground'>
          {t('rentals.loadFailedHint')}
        </p>
        {onRetry ? (
          <Button className='mt-4' onClick={onRetry} variant='outline'>
            {t('status.retry')}
          </Button>
        ) : null}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className='rounded-xl border border-border bg-card p-10 text-center'>
        <p className='font-medium'>{emptyTitle}</p>
        {emptyDescription ? (
          <p className='mt-1 text-sm text-muted-foreground'>
            {emptyDescription}
          </p>
        ) : null}
      </div>
    );
  }

  return <>{children}</>;
}
