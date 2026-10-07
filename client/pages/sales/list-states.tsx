import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { SessionExpiredAlert } from '@/components/session-expired-alert';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The failure state of a list or detail view. The session ending and a refused permission cannot be fixed by retrying,
 * so they explain the situation; anything else offers "Retry".
 */
export function SalesErrorAlert({
  error,
  onRetry,
  notFoundLabel,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
  /** When given, a `404` explains that the record is gone instead of offering a retry that cannot succeed. */
  readonly notFoundLabel?: string;
}): ReactElement {
  const { t } = useTranslation();
  if (error instanceof ApiClientError && error.status === 401) {
    return <SessionExpiredAlert />;
  }
  const forbidden = error instanceof ApiClientError && error.status === 403;
  const notFound =
    notFoundLabel !== undefined &&
    error instanceof ApiClientError &&
    error.status === 404;
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertDescription>
        {notFound
          ? notFoundLabel
          : forbidden
            ? t('sales.error.forbidden')
            : t('sales.error.requestFailed')}
      </AlertDescription>
      {forbidden || notFound ? null : (
        <AlertAction>
          <Button variant='outline' size='sm' onClick={onRetry}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}

/** The loading state of a table: the table's frame with skeleton rows in it. */
export function TableSkeleton({
  columns = 3,
}: {
  readonly columns?: number;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      role='status'
      aria-label={t('status.loading')}
      className='overflow-hidden rounded-lg border'
    >
      {Array.from({ length: 5 }, (_, row) => (
        <div
          key={row}
          className='flex items-center gap-4 border-b px-4 py-3 last:border-b-0'
        >
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className={column === 0 ? 'h-4 w-40' : 'h-4 w-24'}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
