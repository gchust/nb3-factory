/**
 * The presentation pieces the HR pages share: status badges, a loading
 * skeleton, an error state that tells the failure kinds apart, stat cards and
 * a field value that shows an em dash for an empty one.
 */
import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, RefreshCwIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function EmployeeStatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  const variant =
    status === 'active'
      ? 'default'
      : status === 'offboarded'
        ? 'secondary'
        : 'outline';
  return <Badge variant={variant}>{t(`hr.status.employee.${status}`)}</Badge>;
}

export function LeaveStatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  const variant =
    status === 'approved'
      ? 'default'
      : status === 'rejected'
        ? 'destructive'
        : 'outline';
  return <Badge variant={variant}>{t(`hr.status.leave.${status}`)}</Badge>;
}

export function HrLoading({
  rows = 3,
}: {
  readonly rows?: number;
}): ReactElement {
  return (
    <div className='space-y-3'>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className='h-12 w-full' />
      ))}
    </div>
  );
}

export interface HrErrorStateProps {
  readonly error: unknown;
  /** Offered only for a failure that can be retried. */
  readonly onRetry?: () => void;
}

export function HrErrorState({
  error,
  onRetry,
}: HrErrorStateProps): ReactElement {
  const { t } = useTranslation();
  const status = error instanceof ApiClientError ? error.status : undefined;

  const title =
    status === 401
      ? t('hr.error.sessionExpired')
      : status === 403
        ? t('hr.error.forbidden')
        : status === 404
          ? t('hr.error.notFound')
          : t('hr.error.requestFailed');
  const description =
    status === 401
      ? t('hr.error.sessionExpiredDescription')
      : status === 403
        ? t('hr.error.forbiddenDescription')
        : status === 404
          ? t('hr.error.notFoundDescription')
          : t('hr.error.requestFailedDescription');
  const retryable = status !== 401 && status !== 403 && status !== 404;

  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <span>{description}</span>
        {retryable && onRetry ? (
          <Button variant='outline' size='sm' onClick={onRetry}>
            <RefreshCwIcon />
            {t('hr.actions.retry')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly hint?: ReactNode;
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-sm font-medium text-muted-foreground'>
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className='font-heading text-3xl font-semibold tracking-tight'>
          {value}
        </p>
        {hint ? (
          <p className='mt-1 text-xs text-muted-foreground'>{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Renders a possibly empty value, showing an em dash when there is none. */
export function FieldValue({
  value,
}: {
  readonly value: ReactNode | null | undefined;
}): ReactElement {
  if (value === null || value === undefined || value === '') {
    return <span className='text-muted-foreground'>—</span>;
  }
  return <span>{value}</span>;
}

export function EmptyState({
  message,
}: {
  readonly message: ReactNode;
}): ReactElement {
  return (
    <div className='rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
      {message}
    </div>
  );
}
