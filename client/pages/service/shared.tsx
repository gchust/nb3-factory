/* eslint-disable react-refresh/only-export-components -- this module intentionally colocated shared hooks, helpers and the small presentational blocks the service pages reuse */

import { useTranslation } from '@nocobase/i18n/client';
import { Loader2Icon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Button } from '@/components/ui/button';

export interface AsyncState<T> {
  readonly data: T | undefined;
  readonly error: Error | undefined;
  readonly loading: boolean;
  readonly reload: () => void;
}

/**
 * Loads data for a page, with a manual reload used after a mutation. The
 * loader is held in a ref so callers do not have to memoize it.
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[],
): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);

  // Keep the latest loader in a ref after render so callers do not have to
  // memoize it; the data effect below then runs on `deps` alone.
  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    let alive = true;
    void Promise.resolve()
      .then(() => {
        if (!alive) return undefined;
        setLoading(true);
        setError(undefined);
        return loaderRef.current();
      })
      .then((value) => {
        if (!alive || value === undefined) return;
        setData(value);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  }, [nonce, ...deps]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { data, error, loading, reload };
}

export function LoadingBlock(): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground'>
      <Loader2Icon className='size-4 animate-spin' />
      {t('status.loading')}
    </div>
  );
}

export function ErrorBlock({
  error,
  onRetry,
}: {
  readonly error: Error;
  readonly onRetry?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Alert variant='destructive'>
      <AlertTitle>{t('service.error.title')}</AlertTitle>
      <AlertDescription className='flex flex-col items-start gap-3'>
        <span>{error.message}</span>
        {onRetry ? (
          <Button size='sm' variant='outline' onClick={onRetry}>
            {t('service.error.retry')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function EmptyBlock({
  title,
  description,
}: {
  readonly title: string;
  readonly description?: string;
}): ReactElement {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );
}

export function AsyncBlock<T>({
  state,
  empty,
  children,
}: {
  readonly state: AsyncState<T>;
  readonly empty?: (data: T) => boolean;
  readonly children: (data: T) => ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  if (state.loading) return <LoadingBlock />;
  if (state.error)
    return <ErrorBlock error={state.error} onRetry={state.reload} />;
  if (state.data === undefined) return <LoadingBlock />;
  if (empty?.(state.data)) {
    return <EmptyBlock title={t('service.empty.title')} />;
  }
  return <>{children(state.data)}</>;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: string;
  readonly icon?: ReactNode;
}): ReactElement {
  return (
    <Card>
      <CardContent className='flex items-start justify-between gap-4'>
        <div className='space-y-1'>
          <p className='text-sm text-muted-foreground'>{label}</p>
          <p className='font-heading text-2xl font-semibold tabular-nums'>
            {value}
          </p>
          {hint ? (
            <p className='text-xs text-muted-foreground'>{hint}</p>
          ) : null}
        </div>
        {icon ? <div className='text-muted-foreground'>{icon}</div> : null}
      </CardContent>
    </Card>
  );
}

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const TICKET_STATUS: Readonly<Record<string, BadgeVariant>> = {
  pending: 'secondary',
  accepted: 'outline',
  processing: 'default',
  pending_confirm: 'outline',
  closed: 'secondary',
  returned: 'destructive',
};

const TICKET_PRIORITY: Readonly<Record<string, BadgeVariant>> = {
  low: 'secondary',
  normal: 'outline',
  high: 'default',
  urgent: 'destructive',
};

const DEVICE_STATUS: Readonly<Record<string, BadgeVariant>> = {
  active: 'default',
  maintenance: 'outline',
  disabled: 'destructive',
};

const INSPECTION_STATUS: Readonly<Record<string, BadgeVariant>> = {
  planned: 'secondary',
  in_progress: 'outline',
  completed: 'default',
  overdue: 'destructive',
};

const KNOWLEDGE_STATUS: Readonly<Record<string, BadgeVariant>> = {
  published: 'default',
  draft: 'secondary',
};

export function StatusBadge({
  status,
  kind = 'ticket',
}: {
  readonly status: string;
  readonly kind?: 'ticket' | 'device' | 'inspection' | 'knowledge';
}): ReactElement {
  const { t } = useTranslation();
  const variants =
    kind === 'device'
      ? DEVICE_STATUS
      : kind === 'inspection'
        ? INSPECTION_STATUS
        : kind === 'knowledge'
          ? KNOWLEDGE_STATUS
          : TICKET_STATUS;
  return (
    <Badge variant={variants[status] ?? 'outline'}>
      {t(`service.status.${kind}.${status}`, { defaultValue: status })}
    </Badge>
  );
}

export function PriorityBadge({
  priority,
}: {
  readonly priority: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={TICKET_PRIORITY[priority] ?? 'outline'}>
      {t(`service.priority.${priority}`, { defaultValue: priority })}
    </Badge>
  );
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}
