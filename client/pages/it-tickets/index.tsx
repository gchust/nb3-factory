import { useCan } from '@nocobase/app-plugin-authorization/client';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { PlusIcon, SearchIcon, WrenchIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';

import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table-column-header';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ColumnDef } from '@tanstack/react-table';

import { TicketStatusBadge } from './ticket-status-badge.js';
import {
  TICKET_STATUSES,
  type ItTicketView,
  type ItTicketsOutletContext,
  type StatusTab,
  type TicketStatus,
} from './types.js';

function isTicketStatus(value: string | null): value is TicketStatus {
  return TICKET_STATUSES.some((status) => status === value);
}

/** Route `/it-tickets`: every ticket the signed-in user may read. */
export default function ItTicketsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();

  // The status filter lives in the URL, so a refresh, going back or a shared link restores it. The server already
  // scopes the list to the signed-in user's permission: an employee reads only their own tickets.
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const statusTab: StatusTab = isTicketStatus(statusParam)
    ? statusParam
    : 'all';

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = `tickets:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly tickets?: ItTicketView[];
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `tickets:${reloadCount}`;
    api
      .request<{ data: ItTicketView[] }>({
        path: 'it-tickets',
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, tickets: data });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setResult({ key, error });
        },
      );
    return () => controller.abort();
  }, [api, reloadCount]);

  const reload = useCallback((): void => {
    setReloadCount((count) => count + 1);
  }, []);

  function changeStatus(next: StatusTab): void {
    const params = new URLSearchParams(searchParams);
    if (next === 'all') {
      params.delete('status');
    } else {
      params.set('status', next);
    }
    setSearchParams(params, { replace: true });
  }

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const status = error instanceof ApiClientError ? error.status : undefined;
  // While a reload is in flight the previous rows stay on screen, so the page does not flicker.
  const tickets = result?.tickets;

  // A create check decides whether the "New ticket" action appears. It is false while pending, so the action stays
  // hidden until the answer is known rather than flashing for someone who will not be granted it.
  const createAccess = useCan({
    resource: { type: 'composite', id: 'it.tickets' },
    action: 'create',
  });

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  const columns = useMemo<ColumnDef<ItTicketView, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itTickets.columns.title')}
          />
        ),
        cell: ({ row }) => (
          <Link
            className='font-medium hover:underline'
            to={{ pathname: String(row.original.id), search: location.search }}
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'category',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itTickets.columns.category')}
          />
        ),
        cell: ({ row }) => t(`itTickets.category.${row.original.category}`),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itTickets.columns.status')}
          />
        ),
        cell: ({ row }) => <TicketStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'ownerName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itTickets.columns.owner')}
          />
        ),
        cell: ({ row }) => row.original.ownerName ?? '—',
      },
      {
        accessorKey: 'handlerName',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itTickets.columns.handler')}
          />
        ),
        cell: ({ row }) => row.original.handlerName ?? '—',
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('itTickets.columns.createdAt')}
          />
        ),
        cell: ({ row }) => dateFormat.format(new Date(row.original.createdAt)),
      },
    ],
    [t, location.search, dateFormat],
  );

  const counts = useMemo<Record<StatusTab, number>>(() => {
    const totals: Record<StatusTab, number> = {
      all: tickets?.length ?? 0,
      pending: 0,
      in_progress: 0,
      completed: 0,
    };
    for (const ticket of tickets ?? []) totals[ticket.status] += 1;
    return totals;
  }, [tickets]);

  const visible = useMemo(
    () =>
      statusTab === 'all'
        ? (tickets ?? [])
        : (tickets ?? []).filter((ticket) => ticket.status === statusTab),
    [tickets, statusTab],
  );

  const outletContext = useMemo<ItTicketsOutletContext>(
    () => ({ reload }),
    [reload],
  );

  let content: ReactElement;
  if (error && status === 403) {
    content = (
      <Alert variant='destructive'>
        <AlertDescription>{t('itTickets.error.forbidden')}</AlertDescription>
      </Alert>
    );
  } else if (error) {
    content = (
      <Alert variant='destructive'>
        <AlertDescription>
          {t('itTickets.error.requestFailed')}
        </AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (tickets === undefined) {
    content = (
      <div role='status' aria-label={t('status.loading')} className='space-y-3'>
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
      </div>
    );
  } else if (tickets.length === 0) {
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
              nativeButton={false}
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
            >
              <PlusIcon data-icon='inline-start' />
              {t('itTickets.create.action')}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    );
  } else {
    content = (
      <DataTable
        columns={columns}
        data={visible}
        getRowId={(ticket) => ticket.id}
        emptyMessage={t('itTickets.empty.noResults')}
        toolbar={(table) => (
          <InputGroup className='w-full sm:max-w-xs'>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={
                (table.getColumn('title')?.getFilterValue() as
                  string | undefined) ?? ''
              }
              onChange={(event) =>
                table.getColumn('title')?.setFilterValue(event.target.value)
              }
              placeholder={t('itTickets.search.placeholder')}
              aria-label={t('itTickets.search.label')}
            />
          </InputGroup>
        )}
      />
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('itTickets.title')}
        description={t('itTickets.description')}
        actions={
          createAccess.can ? (
            <Button
              nativeButton={false}
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
            >
              <PlusIcon data-icon='inline-start' />
              {t('itTickets.create.action')}
            </Button>
          ) : null
        }
      />

      <div className='space-y-4'>
        <Tabs
          value={statusTab}
          onValueChange={(value) => changeStatus(value as StatusTab)}
        >
          <TabsList variant='line'>
            {(['all', ...TICKET_STATUSES] as const).map((value) => (
              <TabsTrigger key={value} value={value}>
                {value === 'all'
                  ? t('itTickets.status.all')
                  : t(`itTickets.status.${value}`)}
                <Badge variant='secondary' className='tabular-nums'>
                  {counts[value]}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {content}
      </div>

      {/* The create dialog and the detail drawer render here and refresh this list through the context. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
