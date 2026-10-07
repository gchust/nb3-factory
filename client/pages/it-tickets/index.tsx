import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircleIcon, PlusIcon, WrenchIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

import { fetchItTickets } from './it-ticket-api.js';
import { isSessionExpired } from './it-ticket-errors.js';
import { ItTicketStatusBadge } from './status-badge.js';
import {
  IT_TICKET_STATUSES,
  IT_TICKETS_PAGE_ID,
  type ItTicket,
  type ItTicketStatus,
  type ItTicketsOutletContext,
} from './types.js';

/**
 * The list endpoint pages its result and caps a page at 100 records. This page
 * sorts and paginates in the browser, so it asks for the largest page and says
 * so when more records match.
 */
const PAGE_SIZE = 100;

/** The status filter's "no filter" value; a Select item needs a non-empty value. */
const ALL_STATUSES = 'all';

export default function ItTicketsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const [statusFilter, setStatusFilter] = useState<
    ItTicketStatus | typeof ALL_STATUSES
  >(ALL_STATUSES);

  // Submitting is a granted action, like the transitions, so the button is
  // shown from the same declaration the server enforces.
  const createAccess = useCan({
    resource: { type: 'composite', id: IT_TICKETS_PAGE_ID },
    action: 'create',
  });

  // Each reload() call increments the count, and the effect requests again.
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const status = statusFilter === ALL_STATUSES ? undefined : statusFilter;
  const requestKey = JSON.stringify([status ?? null, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: ItTicket[];
    /** How many records match on all pages; more than `rows.length` when the page cap cut the list. */
    readonly total?: number;
    /** Whether the displayed batch was fetched with a filter; tells "empty" apart from "no results". */
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    // Abort when the filter changes or the component unmounts, so an old
    // result never overwrites a new one.
    const controller = new AbortController();
    const key = JSON.stringify([status ?? null, reloadCount]);
    fetchItTickets(
      api,
      { status, page: 1, pageSize: PAGE_SIZE },
      controller.signal,
    ).then(
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
        // Keep the previous batch on failure: after Retry, show the old data
        // and a small Spinner rather than the skeleton again.
        if (!controller.signal.aborted) {
          setResult((previous) => ({ ...previous, key, error }));
        }
      },
    );
    return () => controller.abort();
  }, [api, status, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  // While reloading, `rows` is still the previous batch.
  const rows = result?.rows;
  // Decide by the filters the displayed data was fetched with, not by the
  // current filter: right after "Clear filter", the old result is still shown.
  const rowsFiltered = result?.filtered ?? false;

  // Keep the context passed to child routes stable, or effects in a child that
  // depend on it would run again and again.
  const outletContext = useMemo<ItTicketsOutletContext>(
    () => ({ reload }),
    [reload],
  );

  // The formatter follows the current language and is recreated when it switches.
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }),
    [locale],
  );

  const statusItems = [
    { value: ALL_STATUSES, label: t('itTickets.filters.allStatuses') },
    ...IT_TICKET_STATUSES.map((value) => ({
      value,
      label: t(`itTickets.status.${value}`),
    })),
  ];

  const columns = useMemo<ColumnDef<ItTicket>[]>(
    () => [
      {
        accessorKey: 'title',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itTickets.fields.title')}
          />
        ),
        cell: ({ row }) => (
          // The title links to the detail child route and keeps the current
          // query parameters, so going back returns to the same view.
          <Link
            to={{ pathname: row.original.id, search: location.search }}
            className='font-medium hover:underline'
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        id: 'category',
        accessorFn: (row) => row.category,
        header: t('itTickets.fields.category'),
        cell: ({ row }) => t(`itTickets.category.${row.original.category}`),
      },
      {
        id: 'status',
        accessorFn: (row) => row.status,
        header: t('itTickets.fields.status'),
        cell: ({ row }) => <ItTicketStatusBadge status={row.original.status} />,
      },
      {
        id: 'submitter',
        accessorFn: (row) => row.submitterName,
        header: t('itTickets.fields.submitter'),
        cell: ({ row }) => row.original.submitterName,
      },
      {
        id: 'handler',
        accessorFn: (row) => row.handlerName,
        header: t('itTickets.fields.handler'),
        cell: ({ row }) =>
          row.original.handlerName ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itTickets.fields.createdAt')}
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

  const createButton = createAccess.can ? (
    <Button
      render={<Link to={{ pathname: 'new', search: location.search }} />}
      nativeButton={false}
    >
      <PlusIcon data-icon='inline-start' />
      {t('itTickets.create.action')}
    </Button>
  ) : null;

  function clearFilters(): void {
    setStatusFilter(ALL_STATUSES);
  }

  // Check in the order "failed → first load → empty → data or no results".
  let content: ReactElement;
  if (error) {
    // The API answers an unauthenticated request with 401 and an unauthorized
    // one with 403; retrying cannot succeed without permission.
    const unauthenticated = isSessionExpired(error);
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('itTickets.error.title')}</AlertTitle>
        <AlertDescription>
          {unauthenticated
            ? t('itTickets.error.sessionExpired')
            : forbidden
              ? t('itTickets.error.forbidden')
              : t('itTickets.error.requestFailed')}
        </AlertDescription>
        {forbidden || unauthenticated ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (rows === undefined) {
    content = <ItTicketsTableSkeleton label={t('status.loading')} />;
  } else if (rows.length === 0 && !rowsFiltered) {
    content = (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <WrenchIcon />
          </EmptyMedia>
          <EmptyTitle>{t('itTickets.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('itTickets.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        {createAccess.can ? (
          <EmptyContent>
            <Button
              variant='outline'
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
              nativeButton={false}
            >
              <PlusIcon data-icon='inline-start' />
              {t('itTickets.create.action')}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    );
  } else {
    const capped = (result?.total ?? 0) > rows.length;
    content = (
      <>
        {/* Information, not an error. */}
        {capped ? (
          <p className='text-sm text-muted-foreground'>
            {t('itTickets.capNotice', {
              shown: rows.length,
              total: result?.total ?? rows.length,
            })}
          </p>
        ) : null}
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          // No row selection on this page, so no "n of m row(s) selected" summary.
          showSelectedCount={false}
          emptyMessage={
            <div className='flex flex-col items-center gap-2'>
              <span>{t('itTickets.empty.noResults')}</span>
              <Button variant='link' size='sm' onClick={clearFilters}>
                {t('itTickets.filters.clear')}
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
        title={t('itTickets.title')}
        description={t('itTickets.description')}
        actions={createButton}
      />
      <div className='flex flex-wrap items-center gap-2'>
        <Select
          items={statusItems}
          value={statusFilter}
          onValueChange={(value) =>
            setStatusFilter(value as ItTicketStatus | typeof ALL_STATUSES)
          }
        >
          <SelectTrigger
            className='w-full sm:w-48'
            aria-label={t('itTickets.filters.status')}
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
        {/* Reloading keeps the old data and shows only a small Spinner here. */}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}
      {/* The create dialog and the detail drawer render here and get the list's
          refresh function from context. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function ItTicketsTableSkeleton({
  label,
}: {
  readonly label: string;
}): ReactElement {
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
