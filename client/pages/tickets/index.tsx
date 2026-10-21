import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { CirclePlusIcon, LifeBuoyIcon, SearchIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router';

import { DataTable } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Input } from '#components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';

import { TicketsClient } from './api.js';
import {
  TicketOverdueBadge,
  TicketPriorityBadge,
  TicketStatusBadge,
} from './badges.js';
import { formatDate } from './format.js';
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketFilters,
  type TicketListItem,
  type TicketPage,
} from './types.js';

const PAGE_SIZES = [10, 20, 50] as const;

function firstParam(params: URLSearchParams, key: string): string {
  return params.get(key) ?? '';
}

function isOneOf<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  return values.includes(value as T);
}

export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const client = useMemo(() => new TicketsClient(api), [api]);

  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(
    Number(params.get('pageSize')),
  )
    ? Number(params.get('pageSize'))
    : 20;
  const q = firstParam(params, 'q');
  const status = firstParam(params, 'status');
  const priority = firstParam(params, 'priority');
  const category = firstParam(params, 'category');
  const filters = useMemo<TicketFilters>(
    () => ({
      ...(q ? { q } : {}),
      ...(isOneOf(TICKET_STATUSES, status) ? { status } : {}),
      ...(isOneOf(TICKET_PRIORITIES, priority) ? { priority } : {}),
      ...(isOneOf(TICKET_CATEGORIES, category) ? { category } : {}),
      page,
      pageSize,
    }),
    [q, status, priority, category, page, pageSize],
  );

  const [draftQuery, setDraftQuery] = useState({ key: location.key, value: q });
  const searchValue = draftQuery.key === location.key ? draftQuery.value : q;
  const [revision, setRevision] = useState(0);
  const requestKey = `${revision}:${JSON.stringify(filters)}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly data?: TicketPage;
    readonly error?: unknown;
    readonly loading: boolean;
  }>({ key: '', loading: true });

  useEffect(() => {
    let active = true;
    void client.list(filters).then(
      (next) => {
        if (active) setResult({ key: requestKey, data: next, loading: false });
      },
      (next: unknown) => {
        if (active) setResult({ key: requestKey, error: next, loading: false });
      },
    );
    return () => {
      active = false;
    };
  }, [client, filters, requestKey]);

  const current: {
    readonly data?: TicketPage;
    readonly error?: unknown;
    readonly loading: boolean;
  } = result.key === requestKey ? result : { loading: true };
  const data = current.data;
  const error = current.error;
  const loading = current.loading;

  const update = useCallback(
    (key: string, value: string, resetPage = true) => {
      setParams(
        (old) => {
          const next = new URLSearchParams(old);
          if (value && value !== 'all') next.set(key, value);
          else next.delete(key);
          if (resetPage) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  useEffect(() => {
    if (searchValue === q) return;
    const timer = setTimeout(() => {
      update('q', searchValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [q, searchValue, update]);

  const filtered = Boolean(q || status || priority || category);

  const columns = useMemo<ColumnDef<TicketListItem>[]>(
    () => [
      {
        accessorKey: 'ticketNo',
        header: t('tickets.columns.ticketNo'),
        cell: ({ row }) => (
          <span className='font-mono text-xs text-muted-foreground'>
            {row.original.ticketNo}
          </span>
        ),
      },
      {
        accessorKey: 'title',
        header: t('tickets.columns.ticket'),
        cell: ({ row }) => (
          <div className='flex min-w-48 flex-col gap-0.5'>
            <span className='font-medium'>{row.original.title}</span>
            <span className='text-xs text-muted-foreground'>
              {row.original.requester?.name ?? t('tickets.unknownRequester')}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: t('tickets.columns.status'),
        cell: ({ row }) => (
          <div className='flex flex-wrap items-center gap-1.5'>
            <TicketStatusBadge status={row.original.status} />
            <TicketOverdueBadge overdue={row.original.overdue} />
          </div>
        ),
      },
      {
        accessorKey: 'priority',
        header: t('tickets.columns.priority'),
        cell: ({ row }) => (
          <TicketPriorityBadge priority={row.original.priority} />
        ),
      },
      {
        accessorKey: 'category',
        header: t('tickets.columns.category'),
        cell: ({ row }) => t(`tickets.category.${row.original.category}`),
      },
      {
        accessorKey: 'assignee',
        header: t('tickets.columns.assignee'),
        cell: ({ row }) =>
          row.original.assignee?.name ?? (
            <span className='text-muted-foreground'>
              {t('tickets.unassigned')}
            </span>
          ),
      },
      {
        accessorKey: 'updatedAt',
        header: t('tickets.columns.updated'),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {formatDate(row.original.updatedAt)}
          </span>
        ),
      },
    ],
    [t],
  );

  const openTicket = (ticket: TicketListItem) => {
    void navigate({
      pathname: ticket.id,
      search: location.search,
    });
  };

  const statusOptions = ['all', ...TICKET_STATUSES] as const;

  return (
    <PageContainer className='mx-auto max-w-7xl'>
      <PageHeader
        title={t('tickets.title')}
        description={t('tickets.description')}
        actions={
          <Button
            nativeButton={false}
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <CirclePlusIcon />
            {t('tickets.new')}
          </Button>
        }
      />

      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative min-w-56 flex-1 sm:max-w-sm'>
          <SearchIcon
            className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
            aria-hidden
          />
          <Input
            aria-label={t('tickets.search')}
            className='pl-9'
            placeholder={t('tickets.searchPlaceholder')}
            value={searchValue}
            onChange={(event) =>
              setDraftQuery({ key: location.key, value: event.target.value })
            }
          />
        </div>
        <Select
          items={statusOptions.map((value) => ({
            value,
            label: t(
              value === 'all'
                ? 'tickets.allStatuses'
                : `tickets.status.${value}`,
            ),
          }))}
          value={status || 'all'}
          onValueChange={(value) => update('status', String(value))}
        >
          <SelectTrigger aria-label={t('tickets.columns.status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {t(
                  value === 'all'
                    ? 'tickets.allStatuses'
                    : `tickets.status.${value}`,
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={['all', ...TICKET_PRIORITIES].map((value) => ({
            value,
            label: t(
              value === 'all'
                ? 'tickets.allPriorities'
                : `tickets.priority.${value}`,
            ),
          }))}
          value={priority || 'all'}
          onValueChange={(value) => update('priority', String(value))}
        >
          <SelectTrigger aria-label={t('tickets.columns.priority')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['all', ...TICKET_PRIORITIES] as const).map((value) => (
              <SelectItem key={value} value={value}>
                {t(
                  value === 'all'
                    ? 'tickets.allPriorities'
                    : `tickets.priority.${value}`,
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={['all', ...TICKET_CATEGORIES].map((value) => ({
            value,
            label: t(
              value === 'all'
                ? 'tickets.allCategories'
                : `tickets.category.${value}`,
            ),
          }))}
          value={category || 'all'}
          onValueChange={(value) => update('category', String(value))}
        >
          <SelectTrigger aria-label={t('tickets.columns.category')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['all', ...TICKET_CATEGORIES] as const).map((value) => (
              <SelectItem key={value} value={value}>
                {t(
                  value === 'all'
                    ? 'tickets.allCategories'
                    : `tickets.category.${value}`,
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered ? (
          <Button
            variant='ghost'
            onClick={() => {
              setDraftQuery({ key: location.key, value: '' });
              setParams({}, { replace: true });
            }}
          >
            {t('tickets.clear')}
          </Button>
        ) : null}
      </div>

      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>
            {t(
              typeof error === 'object' &&
                error !== null &&
                Reflect.get(error, 'status') === 403
                ? 'tickets.denied'
                : 'tickets.loadFailed',
            )}
            <Button
              variant='outline'
              size='sm'
              onClick={() => setRevision((value) => value + 1)}
            >
              {t('tickets.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {loading && !data ? (
        <div className='flex flex-col gap-3'>
          <Skeleton className='h-12 w-full' />
          <Skeleton className='h-20 w-full' />
          <Skeleton className='h-20 w-full' />
        </div>
      ) : data && data.rows.length > 0 ? (
        <DataTable<TicketListItem>
          columns={columns}
          data={data.rows}
          getRowId={(row) => row.id}
          manualPagination
          rowCount={data.total}
          paginationState={{ pageIndex: page - 1, pageSize }}
          onPaginationChange={(updater) => {
            const next =
              typeof updater === 'function'
                ? updater({ pageIndex: page - 1, pageSize })
                : updater;
            setParams(
              (old) => {
                const updated = new URLSearchParams(old);
                if (next.pageIndex > 0)
                  updated.set('page', String(next.pageIndex + 1));
                else updated.delete('page');
                if (next.pageSize !== pageSize)
                  updated.set('pageSize', String(next.pageSize));
                return updated;
              },
              { replace: true },
            );
          }}
          onRowClick={(row) => openTicket(row.original)}
          showSelectedCount={false}
          loading={loading}
          emptyMessage={t('tickets.noResults')}
        />
      ) : (
        <Empty className='min-h-56 border border-dashed'>
          <EmptyMedia variant='icon'>
            <LifeBuoyIcon />
          </EmptyMedia>
          <EmptyTitle>
            {t(filtered ? 'tickets.noResults' : 'tickets.noTickets')}
          </EmptyTitle>
          <EmptyDescription>
            {t(filtered ? 'tickets.noResultsHint' : 'tickets.noTicketsHint')}
          </EmptyDescription>
          {!filtered ? (
            <Button
              nativeButton={false}
              render={
                <Link to={{ pathname: 'new', search: location.search }} />
              }
            >
              <CirclePlusIcon />
              {t('tickets.new')}
            </Button>
          ) : null}
        </Empty>
      )}

      <Outlet />
    </PageContainer>
  );
}
