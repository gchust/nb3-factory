import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircleIcon, LifeBuoyIcon, PlusIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';

import { DataTable } from '@/components/data-table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { TicketStatusBadge } from './status-badge.js';
import {
  TICKET_STATUSES,
  isTicketStatus,
  type Ticket,
  type TicketsOutletContext,
} from './types.js';

/** The status filter's "no filter" value, distinct from every real status. */
const ALL_STATUSES = 'all';

export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();

  // The status filter lives in the URL, so a refresh, going back or a shared link restores it.
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const status = isTicketStatus(statusParam) ? statusParam : undefined;

  // The latest query parameters this page wrote, so two changes never overwrite each other.
  const paramsRef = useRef(searchParams);
  useEffect(() => {
    paramsRef.current = searchParams;
  }, [searchParams]);
  function updateParams(mutate: (params: URLSearchParams) => void): void {
    const next = new URLSearchParams(paramsRef.current);
    mutate(next);
    paramsRef.current = next;
    setSearchParams(next, { replace: true });
  }

  function changeStatus(value: string | null): void {
    updateParams((params) => {
      if (value && value !== ALL_STATUSES) params.set('status', value);
      else params.delete('status');
    });
  }

  // Each reload() call increments the count and the effect requests again. The dispatch reference is stable, so it is
  // safe to hand to the child routes below.
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([status ?? null, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Ticket[];
    /** Whether this batch was fetched with a filter; tells "empty" apart from "no results". */
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([status ?? null, reloadCount]);
    api
      .request<{ data: Ticket[] }>({
        path: 'tickets',
        query: { status },
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) {
            setResult({ key, rows: data, filtered: status !== undefined });
          }
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setResult({ key, error });
        },
      );
    return () => controller.abort();
  }, [api, status, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;

  const outletContext = useMemo<TicketsOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  const columns = useMemo<ColumnDef<Ticket, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: t('tickets.columns.title'),
        cell: ({ row }) => (
          <Link
            to={{ pathname: String(row.original.id), search: location.search }}
            className='font-medium hover:underline'
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'category',
        header: t('tickets.columns.category'),
        cell: ({ row }) => t(`tickets.category.${row.original.category}`),
      },
      {
        accessorKey: 'status',
        header: t('tickets.columns.status'),
        cell: ({ row }) => <TicketStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'submitterName',
        header: t('tickets.columns.submitter'),
        cell: ({ row }) =>
          row.original.submitterName ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'handlerName',
        header: t('tickets.columns.handler'),
        cell: ({ row }) =>
          row.original.handlerName ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'updatedAt',
        header: t('tickets.columns.updatedAt'),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {dateFormat.format(new Date(row.original.updatedAt))}
          </span>
        ),
      },
    ],
    [t, location.search, dateFormat],
  );

  const statusItems = [
    { value: ALL_STATUSES, label: t('tickets.filters.all') },
    ...TICKET_STATUSES.map((value) => ({
      value,
      label: t(`tickets.status.${value}`),
    })),
  ];

  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 403) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('tickets.error.title')}</AlertTitle>
        <AlertDescription>{t('tickets.error.forbidden')}</AlertDescription>
      </Alert>
    );
  } else if (error) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('tickets.error.title')}</AlertTitle>
        <AlertDescription>{t('tickets.error.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (rows === undefined) {
    content = (
      <div role='status' aria-label={t('status.loading')} className='space-y-3'>
        {['a', 'b', 'c', 'd'].map((row) => (
          <Skeleton key={row} className='h-10 w-full' />
        ))}
      </div>
    );
  } else if (rows.length === 0 && result?.filtered === false) {
    content = (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <LifeBuoyIcon />
          </EmptyMedia>
          <EmptyTitle>{t('tickets.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('tickets.empty.description')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant='outline'
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('tickets.create.action')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        showSelectedCount={false}
        emptyMessage={t('tickets.noResults')}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('tickets.title')}
        description={t('tickets.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('tickets.create.action')}
          </Button>
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <Select
          items={statusItems}
          value={status ?? ALL_STATUSES}
          onValueChange={changeStatus}
        >
          <SelectTrigger
            className='w-[180px]'
            aria-label={t('tickets.filters.status')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading && rows ? (
          <Spinner className='size-4 text-muted-foreground' />
        ) : null}
      </div>
      {content}
      {/* The submit dialog and detail drawer render here and refresh the list through this context. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
