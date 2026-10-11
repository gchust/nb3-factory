import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircleIcon, InboxIcon, PlusIcon, SearchIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { DataTable } from '#components/data-table';
import { DataTableColumnHeader } from '#components/data-table/column-header';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import { useUrlSearch } from '#hooks/use-url-search';

import {
  TicketOverdueBadge,
  TicketStatusBadge,
  TicketUrgencyBadge,
} from './status-badge.js';
import {
  TICKET_URGENCIES,
  type ItRole,
  type Ticket,
  type TicketList,
  type TicketsOutletContext,
} from './types.js';

// The endpoint pages every list and caps a page at 100 records. This page sorts and paginates in the browser, so it
// asks for the largest page and says so when more records match. A list that outgrows it uses server pagination.
const PAGE_SIZE = 100;

const STATUS_FILTERS = 'open,pending,processing,resolved,closed'.split(',');

export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  const { searchParams, search, text, inputProps, updateParams, clear } =
    useUrlSearch();
  const status = searchParams.get('status') ?? undefined;
  const urgency = searchParams.get('urgency') ?? undefined;
  const scope = searchParams.get('scope') ?? undefined;

  // The caller's role decides which scopes the service offers. A failure here only hides the scope filter.
  const [role, setRole] = useState<ItRole | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api
      .request<{ data: ItRole }>({ path: 'itMe', signal: controller.signal })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setRole(data);
        },
        () => undefined,
      );
    return () => controller.abort();
  }, [api]);

  function changeParam(name: string, value: string | null): void {
    updateParams((params) => {
      if (value && value !== 'all') params.set(name, value);
      else params.delete(name);
    });
  }

  const hasFilters =
    text.trim() !== '' ||
    status !== undefined ||
    urgency !== undefined ||
    scope !== undefined;

  function clearFilters(): void {
    clear((params) => {
      params.delete('status');
      params.delete('urgency');
      params.delete('scope');
    });
    searchRef.current?.focus();
  }

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([
    search,
    status ?? null,
    urgency ?? null,
    scope ?? null,
    reloadCount,
  ]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: readonly Ticket[];
    readonly filtered?: boolean;
    readonly error?: unknown;
    readonly total?: number;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([
      search,
      status ?? null,
      urgency ?? null,
      scope ?? null,
      reloadCount,
    ]);
    api
      .request<TicketList>({
        path: 'itTickets',
        query: {
          keyword: search || undefined,
          status,
          urgency,
          scope,
          pageSize: PAGE_SIZE,
        },
        signal: controller.signal,
      })
      .then(
        ({ data, meta }) => {
          if (!controller.signal.aborted) {
            setResult({
              key,
              rows: data,
              total: meta.total,
              filtered: hasFilters,
            });
          }
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, hasFilters, search, status, urgency, scope, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  const rowsFiltered = result?.filtered ?? false;

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

  const statusItems = [
    { value: 'all', label: t('tickets.filters.allStatuses') },
    ...STATUS_FILTERS.map((value) => ({
      value,
      label: t(`tickets.filters.status.${value}`),
    })),
  ];
  const urgencyItems = [
    { value: 'all', label: t('tickets.filters.allUrgencies') },
    ...TICKET_URGENCIES.map((value) => ({
      value,
      label: t(`tickets.urgency.${value}`),
    })),
  ];
  const scopeItems = [
    { value: 'all', label: t('tickets.scope.all') },
    { value: 'mine', label: t('tickets.scope.mine') },
    { value: 'assigned', label: t('tickets.scope.assigned') },
  ];

  const columns = useMemo<ColumnDef<Ticket>[]>(
    () => [
      {
        accessorKey: 'id',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.fields.number')}
          />
        ),
        cell: ({ row }) => (
          <Link
            to={{ pathname: String(row.original.id), search: location.search }}
            className='font-medium hover:underline'
          >
            #{row.original.id}
          </Link>
        ),
      },
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
          <Link
            to={{ pathname: String(row.original.id), search: location.search }}
            className='font-medium hover:underline'
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'status',
        header: t('tickets.fields.status'),
        cell: ({ row }) => (
          <div className='flex flex-wrap items-center gap-1'>
            <TicketStatusBadge status={row.original.status} />
            {row.original.overdue ? <TicketOverdueBadge /> : null}
          </div>
        ),
      },
      {
        accessorKey: 'urgency',
        header: t('tickets.fields.urgency'),
        cell: ({ row }) => (
          <TicketUrgencyBadge urgency={row.original.urgency} />
        ),
      },
      {
        id: 'reporter',
        accessorFn: (row) => row.reporterName ?? row.reporterId,
        header: t('tickets.fields.reporter'),
        cell: ({ row }) =>
          row.original.reporterName ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        id: 'assignee',
        accessorFn: (row) => row.assigneeName ?? '',
        header: t('tickets.fields.assignee'),
        cell: ({ row }) =>
          row.original.assigneeName ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'updatedAt',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.fields.updatedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {dateFormat.format(new Date(row.original.updatedAt))}
          </span>
        ),
      },
    ],
    [dateFormat, location.search, t],
  );

  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = <SessionExpiredAlert />;
  } else if (error) {
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
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                reload();
                searchRef.current?.focus();
              }}
            >
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
      <Empty className='min-h-48 border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>{t('tickets.empty.title')}</EmptyTitle>
          <EmptyDescription>{t('tickets.empty.description')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('tickets.create.action')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  } else {
    const capped = (result?.total ?? 0) > rows.length;
    content = (
      <>
        {capped ? (
          <p className='text-sm text-muted-foreground'>
            {t('tickets.capNotice', { count: rows.length })}
          </p>
        ) : null}
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => String(row.id)}
          showSelectedCount={false}
          emptyMessage={
            <div className='flex flex-col items-center gap-2'>
              <span>{t('tickets.empty.noResults')}</span>
              <Button variant='link' size='sm' onClick={clearFilters}>
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
          rows !== undefined && (rows.length > 0 || rowsFiltered) ? (
            <Button
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
              nativeButton={false}
            >
              <PlusIcon data-icon='inline-start' />
              {t('tickets.create.action')}
            </Button>
          ) : null
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <InputGroup className='w-full sm:max-w-xs'>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            {...inputProps}
            placeholder={t('tickets.search.placeholder')}
            aria-label={t('tickets.search.label')}
          />
        </InputGroup>
        <Select
          items={statusItems}
          value={status ?? 'all'}
          onValueChange={(value) => changeParam('status', value)}
        >
          <SelectTrigger
            className='w-full sm:w-40'
            aria-label={t('tickets.filters.status.label')}
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
        <Select
          items={urgencyItems}
          value={urgency ?? 'all'}
          onValueChange={(value) => changeParam('urgency', value)}
        >
          <SelectTrigger
            className='w-full sm:w-36'
            aria-label={t('tickets.filters.urgency')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {urgencyItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {role?.isServiceDesk ? (
          <Select
            items={scopeItems}
            value={scope ?? 'all'}
            onValueChange={(value) => changeParam('scope', value)}
          >
            <SelectTrigger
              className='w-full sm:w-36'
              aria-label={t('tickets.filters.scope')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {scopeItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : null}
        {hasFilters ? (
          <Button variant='ghost' onClick={clearFilters}>
            {t('tickets.filters.clear')}
          </Button>
        ) : null}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}

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
          <Skeleton className='h-4 w-12' />
          <Skeleton className='h-4 w-48' />
          <Skeleton className='h-5 w-20 rounded-full' />
          <Skeleton className='ml-auto h-4 w-28' />
        </div>
      ))}
    </div>
  );
}
