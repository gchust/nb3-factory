import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, type ReactNode } from 'react';

import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { cn } from 'cn';

import type { TicketStatus, TicketUrgency } from './api.js';

const STATUS_TONE: Readonly<
  Record<TicketStatus, 'neutral' | 'info' | 'warning' | 'success'>
> = {
  submitted: 'warning',
  assigned: 'info',
  inProgress: 'info',
  resolved: 'warning',
  closed: 'success',
};

const URGENCY_TONE: Readonly<
  Record<TicketUrgency, 'neutral' | 'info' | 'warning' | 'success'>
> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'warning',
  urgent: 'warning',
};

export function TicketStatusBadge({
  status,
  size,
}: {
  readonly status: string;
  readonly size?: 'sm';
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge
      tone={STATUS_TONE[status as TicketStatus] ?? 'neutral'}
      size={size}
    >
      {t(`tickets.status.${status}`, { defaultValue: status })}
    </StatusBadge>
  );
}

export function TicketUrgencyBadge({
  urgency,
  size,
}: {
  readonly urgency: string;
  readonly size?: 'sm';
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge
      tone={URGENCY_TONE[urgency as TicketUrgency] ?? 'neutral'}
      size={size}
    >
      {t(`tickets.urgency.${urgency}`, { defaultValue: urgency })}
    </StatusBadge>
  );
}

/** A label/value pair in a ticket's metadata block. */
export function TicketMeta({
  label,
  children,
  className,
}: {
  readonly label: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className='text-xs text-muted-foreground'>{label}</span>
      <span className='text-sm'>{children}</span>
    </div>
  );
}

/** A failed ticket request, worded for the status the API answered with. */
export function TicketError({
  error,
  retry,
}: {
  readonly error: unknown;
  readonly retry?: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!error) return null;
  const status: unknown =
    typeof error === 'object' && error !== null
      ? Reflect.get(error, 'status')
      : undefined;
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertDescription className='flex flex-wrap items-center gap-3'>
        {t(
          status === 401
            ? 'tickets.error.sessionEnded'
            : status === 403
              ? 'tickets.error.denied'
              : status === 404
                ? 'tickets.error.missing'
                : status === 409
                  ? 'tickets.error.conflict'
                  : 'tickets.error.failed',
        )}
        {retry && ![401, 403, 404, 409].includes(Number(status)) && (
          <Button variant='outline' size='sm' onClick={retry}>
            {t('tickets.error.retry')}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function TicketLoading(): ReactElement {
  const { t } = useTranslation();
  return (
    <div aria-label={t('tickets.loading')} className='flex flex-col gap-3'>
      <Skeleton className='h-10 w-full' />
      <Skeleton className='h-20 w-full' />
      <Skeleton className='h-20 w-full' />
    </div>
  );
}
