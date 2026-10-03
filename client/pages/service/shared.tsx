import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending_accept: 'secondary',
  pending_process: 'default',
  processing: 'default',
  pending_confirm: 'secondary',
  closed: 'outline',
  rejected: 'destructive',
};

const PRIORITY_VARIANT: Record<string, 'secondary' | 'destructive'> = {
  normal: 'secondary',
  urgent: 'destructive',
};

export function OrderStatusBadge({ status }: { status: string }): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>
      {t(`service.order.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

export function OrderPriorityBadge({
  priority,
}: {
  priority: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={PRIORITY_VARIANT[priority] ?? 'secondary'}>
      {t(`service.order.priority.${priority}`, { defaultValue: priority })}
    </Badge>
  );
}

export function InspectionStatusBadge({
  status,
}: {
  status: string;
}): ReactElement {
  const { t } = useTranslation();
  const variant =
    status === 'completed'
      ? 'outline'
      : status === 'overdue'
        ? 'destructive'
        : 'secondary';
  return (
    <Badge variant={variant}>
      {t(`service.inspection.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

export function LoadingBlock({ label }: { label?: ReactNode }): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground'>
      <Spinner />
      {label ?? t('service.common.loading')}
    </div>
  );
}

export function ErrorBlock({
  error,
  onRetry,
}: {
  error: Error;
  onRetry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col items-center gap-3 py-10 text-center'>
      <p className='text-sm text-destructive'>{error.message}</p>
      {onRetry ? (
        <button
          className='text-sm underline underline-offset-4'
          onClick={onRetry}
          type='button'
        >
          {t('service.common.retry')}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyBlock({
  title,
  description,
}: {
  title?: ReactNode;
  description?: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title ?? t('service.common.empty')}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'warning' | 'danger';
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={
            'font-heading text-2xl tabular-nums' +
            (tone === 'danger' ? ' text-destructive' : '')
          }
        >
          {value}
        </CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent className='text-sm text-muted-foreground'>
          {hint}
        </CardContent>
      ) : null}
    </Card>
  );
}
