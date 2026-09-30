import { useTranslation } from '@nocobase/i18n/client';
import { format } from 'date-fns';
import { AlertCircleIcon, InboxIcon, RefreshCwIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';

import { errorMessage } from '../service-api.js';

/** A section heading inside a detail panel or a stacked page. */
export function SectionTitle({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <h3 className='font-heading text-sm font-medium tracking-tight'>
      {children}
    </h3>
  );
}

/** A localized date and time, or an em dash when the column is empty. */
export function DateTimeText({
  value,
}: {
  readonly value: string | null | undefined;
}): ReactElement {
  if (!value) return <span className='text-muted-foreground'>—</span>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span>{value}</span>;
  return <span>{format(date, 'yyyy-MM-dd HH:mm')}</span>;
}

/** A localized date, or an em dash when the column is empty. */
export function DateText({
  value,
}: {
  readonly value: string | null | undefined;
}): ReactElement {
  if (!value) return <span className='text-muted-foreground'>—</span>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span>{value}</span>;
  return <span>{format(date, 'yyyy-MM-dd')}</span>;
}

/** Placeholder rows while a table's first page is on its way. */
export function TableSkeleton({
  rows = 5,
  columns = 5,
}: {
  readonly rows?: number;
  readonly columns?: number;
}): ReactElement {
  return (
    <div className='space-y-2 rounded-lg border p-4'>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={`row-${rowIndex}`} className='flex gap-4'>
          {Array.from({ length: columns }, (_, columnIndex) => (
            <Skeleton key={`cell-${columnIndex}`} className='h-6 flex-1' />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A failed request, with a retry the page wires to its loader. */
export function LoadError({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertTitle>{t('service.state.loadFailed')}</AlertTitle>
      <AlertDescription>
        <span className='block'>{errorMessage(error)}</span>
        <Button variant='outline' size='sm' className='mt-3' onClick={onRetry}>
          <RefreshCwIcon />
          {t('service.state.retry')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** An empty table or panel, with an optional call to action. */
export function EmptyState({
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
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <InboxIcon />
        </EmptyMedia>
        <EmptyTitle>{title ?? t('service.state.empty')}</EmptyTitle>
        <EmptyDescription>
          {description ?? t('service.state.emptyDescription')}
        </EmptyDescription>
      </EmptyHeader>
      {action}
    </Empty>
  );
}
