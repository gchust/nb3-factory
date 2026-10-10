import { useTranslation } from '@nocobase/i18n/client';
import { CircleAlert } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { describeServiceError } from '@/lib/api-error';
import { cn } from '@/lib/utils';

/**
 * The failure of a read, with a way to try it again.
 *
 * Every page shows a failed list or detail through this component rather than
 * an empty table: an empty list and a request that never arrived look the same
 * otherwise, and only one of them means there is nothing to show.
 */
export interface ServiceErrorNoticeProps {
  readonly error: unknown;
  readonly onRetry?: () => void;
  readonly className?: string;
}

export function ServiceErrorNotice({
  className,
  error,
  onRetry,
}: ServiceErrorNoticeProps): ReactElement {
  const { t } = useTranslation();
  const info = describeServiceError(error);
  const detail = [
    info.reason ? t('service.errors.reason', { reason: info.reason }) : null,
    info.requestId
      ? t('service.errors.requestId', { requestId: info.requestId })
      : null,
  ].filter((part): part is string => part !== null);

  return (
    <Alert className={cn('items-start', className)} variant='destructive'>
      <CircleAlert aria-hidden='true' />
      <AlertTitle>{t(`service.errors.${info.kind}`)}</AlertTitle>
      {detail.length > 0 ? (
        <AlertDescription>{detail.join(' · ')}</AlertDescription>
      ) : null}
      {onRetry ? (
        <AlertAction>
          <Button onClick={onRetry} size='sm' variant='outline'>
            {t('service.actions.retry')}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

/** A short success-or-failure line under a form, for the outcome of a write. */
export function ServiceFormNotice({
  children,
  tone,
}: {
  readonly children: ReactNode;
  readonly tone: 'error' | 'success';
}): ReactElement {
  return (
    <p
      className={cn(
        'text-sm',
        tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
      )}
      role='status'
    >
      {children}
    </p>
  );
}
