/**
 * The shared non-happy-path surfaces of a service page: a failed request and an
 * empty table. Both say what happened in the reader's language; neither invents a
 * reason the server did not send.
 */

import { useTranslation } from '@nocobase/i18n/client';
import { Loader2Icon, RotateCcwIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';

/** The message an `ApiClientError` carries, or a fallback for anything else. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

export function RequestError({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      role='alert'
      className='flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm'
    >
      <p className='text-destructive'>
        {errorMessage(error, t('service.error.requestFailed'))}
      </p>
      {onRetry ? (
        <Button variant='outline' size='sm' onClick={onRetry}>
          <RotateCcwIcon />
          {t('service.action.retry')}
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyTable({
  title,
  description,
  action,
}: {
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Empty className='border border-dashed'>
      <EmptyHeader>
        <EmptyTitle>{title ?? t('service.empty.title')}</EmptyTitle>
        <EmptyDescription>
          {description ?? t('service.empty.description')}
        </EmptyDescription>
      </EmptyHeader>
      {action ? <div className='mt-4'>{action}</div> : null}
    </Empty>
  );
}

export function LoadingState(): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      role='status'
      className='flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground'
    >
      <Loader2Icon className='size-4 animate-spin' />
      {t('service.loading')}
    </div>
  );
}
