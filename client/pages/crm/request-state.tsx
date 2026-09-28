import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** A placeholder for a list before its first result arrives. */
export function CrmListSkeleton(): ReactElement {
  return (
    <div
      role='status'
      className='space-y-3 rounded-lg border p-4'
      aria-hidden='true'
    >
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} className='h-8 w-full' />
      ))}
    </div>
  );
}

export interface CrmErrorProps {
  readonly error: unknown;
  readonly onRetry?: () => void;
  /** The message for a 404 on a single record, overriding the generic one. */
  readonly notFoundMessage?: string;
}

/**
 * The failure state of a CRM request. A record that no longer exists (404) and
 * a denied request (403) are not retryable, so neither offers Retry; anything
 * else is treated as temporary and does.
 */
export function CrmError({
  error,
  onRetry,
  notFoundMessage,
}: CrmErrorProps): ReactElement | null {
  const { t } = useTranslation();
  if (!error) {
    return null;
  }

  const apiError = error instanceof ApiClientError ? error : undefined;
  const retryable = apiError?.status !== 404 && apiError?.status !== 403;

  let message: string;
  if (apiError?.status === 404) {
    message = notFoundMessage ?? t('crm.error.notFound');
  } else if (apiError?.status === 403) {
    message = t('crm.error.forbidden');
  } else {
    message = t('crm.error.requestFailed');
  }

  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertDescription>{message}</AlertDescription>
      {retryable && onRetry ? (
        <AlertAction>
          <Button variant='outline' size='sm' onClick={onRetry}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}
