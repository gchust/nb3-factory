/* eslint-disable react-refresh/only-export-components -- the shared async hook and the presentational helpers are colocated so a page imports one module */
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';

import type {
  KnowledgeStatus,
  WorkOrderPriority,
  WorkOrderStatus,
} from './types.js';

/** Runs an async loader and exposes its result, its failure and a way to run it again. */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[] = [],
): {
  readonly data: T | undefined;
  readonly error: unknown;
  readonly loading: boolean;
  readonly reload: () => void;
} {
  const [revision, setRevision] = useState(0);
  const [settled, setSettled] = useState<{
    readonly key: string;
    readonly value?: T;
    readonly error?: unknown;
  }>();
  const loaderRef = useRef(loader);
  // The key states when the request must be repeated; loading is derived from
  // whether the settled result belongs to the current key, so the effect never
  // has to set state synchronously.
  const key = `${JSON.stringify(deps)}#${revision}`;

  // Keep the latest loader without restarting the effect, so a caller can pass
  // a fresh closure while its declared dependencies stay the same.
  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    let active = true;
    loaderRef
      .current()
      .then((value) => {
        if (active) {
          setSettled({ key, value });
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setSettled({ key, error: cause });
        }
      });
    return () => {
      active = false;
    };
  }, [key]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const current = settled?.key === key ? settled : undefined;
  return {
    data: current?.value,
    error: current?.error,
    loading: current === undefined,
    reload,
  };
}

/** The readable message of a failure raised by this application's API client. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function PageLoading(): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground'>
      <Loader2 className='size-4 animate-spin' />
      {t('service.common.loading')}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Alert variant='destructive'>
      <AlertCircle />
      <AlertTitle>{t('service.common.loadFailed')}</AlertTitle>
      <AlertDescription>
        <span>{errorMessage(error)}</span>
        {onRetry ? (
          <button
            className='ml-2 underline underline-offset-2'
            onClick={onRetry}
            type='button'
          >
            {t('status.retry')}
          </button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function EmptyState({
  title,
  description,
}: {
  readonly title?: string;
  readonly description?: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <Inbox />
        </EmptyMedia>
        <EmptyTitle>{title ?? t('service.common.empty')}</EmptyTitle>
        <EmptyDescription>
          {description ?? t('service.common.emptyHint')}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

const STATUS_VARIANT: Record<
  WorkOrderStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending_accept: 'secondary',
  pending_process: 'outline',
  processing: 'default',
  pending_confirm: 'secondary',
  closed: 'outline',
};

export function StatusBadge({
  status,
}: {
  readonly status: WorkOrderStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>
      {t(`service.status.${status}`)}
    </Badge>
  );
}

export function PriorityBadge({
  priority,
}: {
  readonly priority: WorkOrderPriority;
}): ReactElement {
  const { t } = useTranslation();
  if (priority !== 'urgent') {
    return <span className='text-muted-foreground'>—</span>;
  }
  return <Badge variant='destructive'>{t('service.priority.urgent')}</Badge>;
}

export function ConfidentialBadge(): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant='outline'>{t('service.workOrders.confidential')}</Badge>
  );
}

export function KnowledgeStatusBadge({
  status,
}: {
  readonly status: KnowledgeStatus;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={status === 'published' ? 'default' : 'secondary'}>
      {t(`service.knowledgeStatus.${status}`)}
    </Badge>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly hint?: ReactNode;
  readonly tone?: 'default' | 'warning' | 'danger';
}): ReactElement {
  return (
    <Card>
      <CardContent className='space-y-1 pt-6'>
        <p className='text-sm text-muted-foreground'>{label}</p>
        <p
          className={cn(
            'font-heading text-3xl font-semibold tracking-tight',
            tone === 'warning' && 'text-amber-600 dark:text-amber-500',
            tone === 'danger' && 'text-destructive',
          )}
        >
          {value}
        </p>
        {hint ? <p className='text-xs text-muted-foreground'>{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

/** Formats an ISO date as a date only, in the browser's locale. */
export function formatDate(value?: string | null): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString();
}

/** Formats an ISO timestamp as date and time, in the browser's locale. */
export function formatDateTime(value?: string | null): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString();
}

/** Whether a not-yet-closed order is past its due time. */
export function isOverdue(
  order: { readonly dueAt?: string | null; readonly status: string },
  now: Date = new Date(),
): boolean {
  if (order.status === 'closed' || !order.dueAt) {
    return false;
  }
  const due = new Date(order.dueAt);
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
}
