import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, RefreshCwIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** A ticket status as a colored badge, with the localized label. */
export function StatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  const styles: Record<string, string> = {
    pending_acceptance: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    pending_processing: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    processing: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    pending_confirmation:
      'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    closed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    skipped: 'bg-muted text-muted-foreground',
    pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  };
  return (
    <Badge
      variant='outline'
      className={cn('border-transparent', styles[status] ?? 'bg-muted')}
    >
      {t(`service.ticketStatus.${status}`)}
    </Badge>
  );
}

export function PriorityBadge({
  priority,
}: {
  readonly priority: string;
}): ReactElement {
  const { t } = useTranslation();
  if (priority === 'urgent') {
    return <Badge variant='destructive'>{t('service.priority.urgent')}</Badge>;
  }
  return <Badge variant='secondary'>{t('service.priority.normal')}</Badge>;
}

/** The 403/404/network failure of one request, with a retry when retrying can help. */
export function QueryError({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const apiError = error instanceof ApiClientError ? error : undefined;
  const notFound = apiError?.status === 404;
  const forbidden = apiError?.status === 403;
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertDescription>
        {notFound
          ? t('service.error.notFound')
          : forbidden
            ? t('service.error.forbidden')
            : t('service.error.requestFailed')}
        {apiError && !notFound && !forbidden ? ` (${apiError.status})` : ''}
      </AlertDescription>
      {!notFound && !forbidden ? (
        <AlertAction>
          <Button variant='outline' size='sm' onClick={onRetry}>
            <RefreshCwIcon />
            {t('service.actions.retry')}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

/** A stacked placeholder shown while a page loads its data. */
export function LoadingBlock({
  rows = 4,
}: {
  readonly rows?: number;
}): ReactElement {
  return (
    <div className='space-y-3' aria-busy='true'>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className='h-12 w-full' />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  readonly title: ReactNode;
  readonly description?: ReactNode;
}): ReactElement {
  return (
    <div className='rounded-lg border border-dashed p-8 text-center'>
      <p className='font-medium'>{title}</p>
      {description ? (
        <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
      ) : null}
    </div>
  );
}
