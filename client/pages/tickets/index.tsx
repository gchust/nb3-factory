import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircleIcon, PlusIcon, TicketIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { SessionExpiredAlert } from '@/components/session-expired-alert';
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useCan } from '@nocobase/app-plugin-authorization/client';

import { TicketStatusBadge } from './status-badge.js';
import {
  TICKET_STATUSES,
  type Ticket,
  type TicketList,
  type TicketStatus,
  type TicketsOutletContext,
} from './types.js';

// The endpoint caps a page at 100 records. This page filters and paginates in the browser, so it asks for the largest
// page and says so when more records match. A list that outgrows it moves to a server-paginated table.
const PAGE_SIZE = 100;

const TICKET_RESOURCE = 'tickets';

function isTicketStatus(value: string | null): value is TicketStatus {
  return TICKET_STATUSES.some((status) => status === value);
}

export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Submit is offered only to an identity whose grants include it; the server refuses it either way.
  const { can: canCreate, isPending: createPending } = useCan({
    resource: { type: 'composite', id: TICKET_RESOURCE },
    action: 'create',
  });
  const showCreate = canCreate && !createPending;

  // The status filter lives in the URL, so it survives a refresh, a relogin and a shared link.
  const statusParam = searchParams.get('status');
  const status = isTicketStatus(statusParam) ? statusParam : undefined;

  function changeStatus(value: string | null): void {
    const next = new URLSearchParams(searchParams);
    if (value && value !== 'all') next.set('status', value);
    else next.delete('status');
    setSearchParams(next, { replace: true });
  }

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([status ?? null, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Ticket[];
    /** Whether this batch was fetched with a filter; tells "empty" apart from "no results". */
    readonly filtered?: boolean;
    readonly error?: unknown;
    /** The number of matching records on all pages; more than rows.length when the cap cut the list. */
    readonly total?: number;
  }>();

  useEffect(() => {
    // Abort the request when the filter changes or the component unmounts, so an old result never overwrites a new one.
    const controller = new AbortController();
    const key = JSON.stringify([status ?? null, reloadCount]);
    api
      .request<TicketList>({
        path: 'tickets',
        query: { status, pageSize: PAGE_SIZE },
        signal: controller.signal,
      })
      .then(
        ({ data, meta }) => {
          if (!controller.signal.aborted) {
            setResult({
              key,
              rows: data,
              total: meta.total,
              filtered: status !== undefined,
            });
          }
        },
        (error: unknown) => {
          // Keep the previous batch on failure: after "Retry", show the old data and a small Spinner, not the skeleton.
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, status, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  // While reloading, rows is still the previous batch.
  const rows = result?.rows;
  const rowsFiltered = result?.filtered ?? false;

  // Keep the context passed to child routes stable; otherwise effects in child routes that depend on it run again and again.
  const outletContext = useMemo<TicketsOutletContext>(
    () => ({ reload }),
    [reload],
  );

  // The formatter follows the current language and is rebuilt when it switches.
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  const statusItems = [
    { value: 'all', label: t('tickets.filters.allStatuses') },
    ...TICKET_STATUSES.map((value) => ({
      value,
      label: t(`tickets.status.${value}`),
    })),
  ];

  const columns = useMemo<ColumnDef<Ticket>[]>(
    () => [
      {
        accessorKey: 'title',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.fields.title')}
          />
        ),
        cell: ({ row }) => (
          // The title links to the detail child route and keeps the current query parameters.
          <Link
            to={{
              pathname: String(row.original.id),
              search: location.search,
            }}
            className='font-medium hover:underline'
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'category',
        header: t('tickets.fields.category'),
        cell: ({ row }) => t(`tickets.category.${row.original.category}`),
      },
      {
        accessorKey: 'status',
        header: t('tickets.fields.status'),
        cell: ({ row }) => <TicketStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'submitterName',
        header: t('tickets.fields.submitter'),
        cell: ({ row }) =>
          row.original.submitterName ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'handlerName',
        header: t('tickets.fields.handler'),
        cell: ({ row }) =>
          row.original.handlerName ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'createdAt',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.fields.createdAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {dateFormat.format(new Date(row.original.createdAt))}
          </span>
        ),
      },
    ],
    [dateFormat, location.search, t],
  );

  // Check in the order "failed → first load → empty → data or no results".
  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    // The session ended; signing in again is the only way forward.
    content = <SessionExpiredAlert />;
  } else if (error) {
    // Retrying cannot succeed without permission, so offer no "Retry".
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('tickets.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('tickets.error.forbidden')
            : t('tickets.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (rows === undefined) {
    content = <TableSkeleton label={t('status.loading')} />;
  } else if (rows.length === 0 && !rowsFiltered) {
    content = (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <TicketIcon />
          </EmptyMedia>
          <EmptyTitle>{t('tickets.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('tickets.empty.description')}</EmptyDescription>
        </EmptyHeader>
        {showCreate ? (
          <EmptyContent>
            {/* The page header already has the primary button, so use outline here: one primary button per view. */}
            <Button
              variant='outline'
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
              nativeButton={false}
            >
              <PlusIcon data-icon='inline-start' />
              {t('tickets.create.action')}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    );
  } else {
    const capped = (result?.total ?? 0) > rows.length;
    content = (
      <>
        {/* Information, not an error: a plain paragraph, not an alert. */}
        {capped ? (
          <p className='text-sm text-muted-foreground'>
            {t('tickets.capNotice', { count: rows.length })}
          </p>
        ) : null}
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => String(row.id)}
          // No row selection on this page, so no "0 of N row(s) selected" summary.
          showSelectedCount={false}
          emptyMessage={
            <div className='flex flex-col items-center gap-2'>
              <span>{t('tickets.empty.noResults')}</span>
              <Button
                variant='link'
                size='sm'
                onClick={() => changeStatus(null)}
              >
                {t('tickets.filters.clear')}
              </Button>
            </div>
          }
        />
      </>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('tickets.title')}
        description={t('tickets.description')}
        actions={
          showCreate ? (
            <Button
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
              nativeButton={false}
            >
              <PlusIcon data-icon='inline-start' />
              {t('tickets.create.action')}
            </Button>
          ) : undefined
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <Select
          items={statusItems}
          value={status ?? 'all'}
          onValueChange={changeStatus}
        >
          <SelectTrigger
            className='w-full sm:w-44'
            aria-label={t('tickets.filters.status')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {statusItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {status !== undefined ? (
          <Button variant='ghost' onClick={() => changeStatus(null)}>
            {t('tickets.filters.clear')}
          </Button>
        ) : null}
        {/* Reloading keeps the old data and shows only a small Spinner here. */}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}

      {/* The create dialog and the detail drawer render here and get the list's refresh function from context. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function TableSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <div
      role='status'
      aria-label={label}
      className='overflow-hidden rounded-lg border'
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className='flex items-center gap-4 border-b px-4 py-3 last:border-b-0'
        >
          <Skeleton className='h-4 w-40' />
          <Skeleton className='h-4 w-24' />
          <Skeleton className='h-5 w-16 rounded-full' />
          <Skeleton className='ml-auto h-4 w-28' />
        </div>
      ))}
    </div>
  );
}
