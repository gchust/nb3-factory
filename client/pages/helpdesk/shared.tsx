import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, RotateCcwIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Skeleton } from '#components/ui/skeleton';
import { errorMessage } from './api.js';
import { priorityTone, statusTone } from './display.js';

export function StatusLabel({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={statusTone(status)} size='sm'>
      {t(`helpdesk.status.${status}`, { defaultValue: status })}
    </StatusBadge>
  );
}

export function PriorityLabel({
  priority,
}: {
  readonly priority: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={priorityTone(priority)} size='sm'>
      {t(`helpdesk.priority.${priority}`, { defaultValue: priority })}
    </StatusBadge>
  );
}

export function CategoryLabel({
  category,
}: {
  readonly category: string;
}): ReactElement {
  const { t } = useTranslation();
  return <>{t(`helpdesk.category.${category}`, { defaultValue: category })}</>;
}

export function TransitionLabel({
  transition,
  title,
}: {
  readonly transition: string;
  readonly title?: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      {t(`helpdesk.transition.${transition}`, {
        defaultValue: title ?? transition,
      })}
    </>
  );
}

export function HelpdeskError({
  error,
  retry,
}: {
  readonly error: unknown;
  readonly retry?: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!error) return null;
  return (
    <div
      role='alert'
      className='flex flex-col items-start gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center'
    >
      <AlertCircleIcon className='size-4 shrink-0 text-destructive' />
      <p className='flex-1 text-destructive'>
        {errorMessage(error, t('helpdesk.errors.loadFailed'))}
      </p>
      {retry && (
        <Button variant='outline' size='sm' onClick={retry}>
          <RotateCcwIcon data-icon='inline-start' />
          {t('helpdesk.actions.retry')}
        </Button>
      )}
    </div>
  );
}

export function HelpdeskLoading({
  rows = 3,
}: {
  readonly rows?: number;
}): ReactElement {
  return (
    <div className='flex flex-col gap-3' aria-busy='true'>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className='h-20 w-full rounded-lg' />
      ))}
    </div>
  );
}

export function HelpdeskEmpty({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}): ReactElement {
  return (
    <Empty className='border border-dashed py-12'>
      <EmptyMedia variant='icon'>
        <AlertCircleIcon />
      </EmptyMedia>
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
      {action}
    </Empty>
  );
}

export function TicketLink({
  ticket,
  children,
}: {
  readonly ticket: { id: string; ticketNo: string };
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <Link
      to={`/helpdesk/tickets/${encodeURIComponent(ticket.id)}`}
      className='font-medium underline-offset-4 hover:underline'
    >
      {children ?? ticket.ticketNo}
    </Link>
  );
}
