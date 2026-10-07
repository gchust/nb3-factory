import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  PlusIcon,
  SearchIcon,
  TicketIcon,
} from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';

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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
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
import { useUrlSearch } from '@/hooks/use-url-search';

import { fetchTickets } from './api.js';
import { TicketStatusBadge, TicketUrgencyBadge } from './status-badge.js';
import {
  TICKET_STATUSES,
  TICKET_URGENCIES,
  type Ticket,
  type TicketsOutletContext,
} from './types.js';

const PAGE_SIZE = 100;

export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const navigate = useNavigate();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  const { searchParams, search, text, inputProps, updateParams, clear } =
    useUrlSearch();
  const status = searchParams.get('status') ?? '';
  const urgency = searchParams.get('urgency') ?? '';
  const overdue = searchParams.get('overdue') === 'true';
  const hasFilters =
    text.trim() !== '' || status !== '' || urgency !== '' || overdue;

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([
    search,
    status,
    urgency,
    overdue,
    reloadCount,
  ]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: Ticket[];
    readonly total?: number;
    readonly filtered?: boolean;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([search, status, urgency, overdue, reloadCount]);
    fetchTickets(
      api,
      {
        q: search,
        status: status || undefined,
        urgency: urgency || undefined,
        overdue: overdue || undefined,
        pageSize: PAGE_SIZE,
      },
      controller.signal,
    ).then(
      ({ data, total }) => {
        if (!controller.signal.aborted) {
          setResult({
            key,
            rows: data,
            total,
            filtered:
              search !== '' || status !== '' || urgency !== '' || overdue,
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
  }, [api, search, status, urgency, overdue, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  const rowsFiltered = result?.filtered ?? false;

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  function changeParam(name: string, value: string): void {
    updateParams((params) => {
      if (value && value !== 'all') params.set(name, value);
      else params.delete(name);
    });
  }

  function clearFilters(): void {
    clear((params) => {
      params.delete('status');
      params.delete('urgency');
      params.delete('overdue');
    });
    searchRef.current?.focus();
  }

  const statusItems = [
    { value: 'all', label: t('tickets.filters.allStatuses') },
    ...TICKET_STATUSES.map((value) => ({
      value,
      label: t(`tickets.status.${value}`),
    })),
  ];
  const urgencyItems = [
    { value: 'all', label: t('tickets.filters.allUrgencies') },
    ...TICKET_URGENCIES.map((value) => ({
      value,
      label: t(`tickets.urgency.${value}`),
    })),
  ];
  const overdueItems = [
    { value: 'all', label: t('tickets.filters.allTickets') },
    { value: 'overdue', label: t('tickets.filters.overdueOnly') },
  ];

  const columns = useMemo<ColumnDef<Ticket>[]>(
    () => [
      {
        accessorKey: 'ticketNo',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('tickets.fields.ticketNo')}
          />
        ),
        cell: ({ row }) => (
          <span className='font-mono text-xs text-muted-foreground'>
            {row.original.ticketNo}
          </span>
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
        accessorKey: 'urgency',
        header: t('tickets.fields.urgency'),
        cell: ({ row }) => (
          <TicketUrgencyBadge urgency={row.original.urgency} />
        ),
      },
      {
        accessorKey: 'status',
        header: t('tickets.fields.status'),
        cell: ({ row }) => (
          <div className='flex items-center gap-2'>
            <TicketStatusBadge status={row.original.status} />
            {row.original.overdue ? (
              <span className='text-xs text-destructive'>
                {t('tickets.overdue')}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'reporterName',
        header: t('tickets.fields.reporter'),
        cell: ({ row }) => row.original.reporterName,
      },
      {
        id: 'assigneeName',
        accessorFn: (row) => row.assigneeName ?? '',
        header: t('tickets.fields.assignee'),
        cell: ({ row }) =>
          row.original.assigneeName ?? (
            <span className='text-muted-foreground'>
              {t('tickets.unassigned')}
            </span>
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

  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('tickets.error.title')}</AlertTitle>
        <AlertDescription>{t('tickets.error.sessionExpired')}</AlertDescription>
      </Alert>
    );
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
    content = (
      <div role='status' aria-label={t('status.loading')} className='space-y-2'>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className='h-10 w-full' />
        ))}
      </div>
    );
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
        <EmptyContent>
          <Button
            variant='outline'
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
    content = (
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        showSelectedCount={false}
        onRowClick={(row) => {
          void navigate({
            pathname: String(row.original.id),
            search: location.search,
          });
        }}
        emptyMessage={
          <div className='flex flex-col items-center gap-2'>
            <span>{t('tickets.empty.noResults')}</span>
            <Button variant='link' size='sm' onClick={clearFilters}>
              {t('tickets.filters.clear')}
            </Button>
          </div>
        }
      />
    );
  }

  const outletContext: TicketsOutletContext = { reload };

  return (
    <PageContainer>
      <PageHeader
        title={t('tickets.title')}
        description={t('tickets.description')}
        actions={
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
            nativeButton={false}
          >
            <PlusIcon data-icon='inline-start' />
            {t('tickets.create.action')}
          </Button>
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
          value={status || 'all'}
          onValueChange={(value) => changeParam('status', value ?? '')}
        >
          <SelectTrigger
            className='w-full sm:w-40'
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
        <Select
          items={urgencyItems}
          value={urgency || 'all'}
          onValueChange={(value) => changeParam('urgency', value ?? '')}
        >
          <SelectTrigger
            className='w-full sm:w-40'
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
        <Select
          items={overdueItems}
          value={overdue ? 'overdue' : 'all'}
          onValueChange={(value) =>
            changeParam('overdue', value === 'overdue' ? 'true' : '')
          }
        >
          <SelectTrigger
            className='w-full sm:w-40'
            aria-label={t('tickets.filters.overdue')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {overdueItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
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

      {/* The create dialog and a ticket's own page render here as child routes. */}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
