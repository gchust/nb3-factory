import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircle, Inbox } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Loading } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function LoadingState({
  label,
}: {
  readonly label?: string;
}): ReactElement {
  return <Loading className='min-h-40' label={label} />;
}

export function ErrorState({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className='flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center'>
      <AlertCircle aria-hidden='true' className='size-6 text-destructive' />
      <div className='space-y-1'>
        <p className='font-medium text-foreground'>
          {t('service.common.loadFailed')}
        </p>
        <p className='max-w-xl break-words text-sm text-muted-foreground'>
          {message}
        </p>
      </div>
      {onRetry ? (
        <Button onClick={onRetry} size='sm' variant='outline'>
          {t('service.common.retry')}
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  message,
  action,
  className,
}: {
  readonly message?: string;
  readonly action?: ReactNode;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'flex min-h-32 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground',
        className,
      )}
    >
      <Inbox aria-hidden='true' className='size-5' />
      <p className='text-sm'>{message ?? t('service.common.empty')}</p>
      {action}
    </div>
  );
}
