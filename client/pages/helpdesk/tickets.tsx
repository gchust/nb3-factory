import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { InboxIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';
import { DataTable } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyContent,
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
import { useApiData } from './api.js';
import {
  CategoryLabel,
  HelpdeskError,
  HelpdeskLoading,
  PriorityLabel,
  StatusLabel,
  TicketLink,
} from './shared.js';
import { formatDateTime } from './display.js';
import type { Ticket, TicketPriority, TicketStatus } from './types.js';

const STATUSES: readonly (TicketStatus | 'all')[] = [
  'all',
  'open',
  'processing',
  'resolved',
  'closed',
];
const PRIORITIES: readonly (TicketPriority | 'all')[] = [
  'all',
  'urgent',
  'high',
  'medium',
  'low',
];

export default function TicketsPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [queryDraft, setQueryDraft] = useState<{
    key: string;
    value: string;
  }>();
  const query =
    queryDraft?.key === location.key
      ? queryDraft.value
      : (params.get('search') ?? '');
  const setQuery = (value: string) =>
    setQueryDraft({ key: location.key, value });
  const [composing, setComposing] = useState(false);
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = [20, 50, 100].includes(Number(params.get('pageSize')))
    ? Number(params.get('pageSize'))
    : 20;
  const status = (params.get('status') ?? 'all') as TicketStatus | 'all';
  const priority = (params.get('priority') ?? 'all') as TicketPriority | 'all';
  const update = (key: string, value: string) => {
    setParams(
      (old) => {
        const next = new URLSearchParams(old);
        if (value && value !== 'all') next.set(key, value);
        else next.delete(key);
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  };
  useEffect(() => {
    if (composing || query === (params.get('search') ?? '')) return;
    const timer = setTimeout(() => {
      setParams(
        (old) => {
          const next = new URLSearchParams(old);
          if (query) next.set('search', query);
          else next.delete('search');
          next.delete('page');
          return next;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [query, composing, params, setParams]);

  const remote = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(params.get('search') ? { search: params.get('search')! } : {}),
    ...(status !== 'all' ? { status } : {}),
    ...(priority !== 'all' ? { priority } : {}),
    ...(params.get('overdue') === 'true' ? { overdue: 'true' } : {}),
  });
  const request = useApiData<{
    data: readonly Ticket[];
    meta: { total: number };
  }>(`helpdesk/tickets?${remote}`);
  const canCreate = useCan({
    resource: { type: 'composite', id: 'helpdesk.tickets' },
    action: 'create',
  });

  const columns = useMemo<ColumnDef<Ticket>[]>(
    () => [
      {
        accessorKey: 'ticketNo',
        header: t('helpdesk.fields.ticket'),
        enableSorting: false,
        cell: ({ row }) => (
          <div className='flex min-w-0 flex-col gap-1'>
            <TicketLink ticket={row.original} />
            <Link
              to={`/helpdesk/tickets/${encodeURIComponent(row.original.id)}`}
              className='max-w-72 truncate font-medium text-foreground underline-offset-4 hover:underline'
              title={row.original.title}
            >
              {row.original.title}
            </Link>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: t('helpdesk.fields.status'),
        enableSorting: false,
        cell: ({ row }) => <StatusLabel status={row.original.status} />,
      },
      {
        accessorKey: 'priority',
        header: t('helpdesk.fields.priority'),
        enableSorting: false,
        cell: ({ row }) => <PriorityLabel priority={row.original.priority} />,
      },
      {
        accessorKey: 'category',
        header: t('helpdesk.fields.category'),
        enableSorting: false,
        cell: ({ row }) => <CategoryLabel category={row.original.category} />,
      },
      {
        accessorKey: 'updatedAt',
        header: t('helpdesk.fields.updated'),
        enableSorting: false,
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {formatDateTime(row.original.updatedAt, i18n.language)}
          </span>
        ),
      },
    ],
    [t, i18n.language],
  );

  const rows = request.data?.data ?? [];
  const overdue = params.get('overdue') === 'true';
  const filtered =
    Boolean(params.get('search')) ||
    status !== 'all' ||
    priority !== 'all' ||
    overdue;
  const create = canCreate.can ? (
    <Button
      nativeButton={false}
      render={<Link to={{ pathname: 'create', search: location.search }} />}
    >
      <PlusIcon data-icon='inline-start' />
      {t('helpdesk.tickets.create')}
    </Button>
  ) : undefined;

  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('helpdesk.tickets.title')}
          description={t('helpdesk.tickets.description')}
          actions={rows.length || filtered ? create : undefined}
        />
        <div className='flex flex-wrap items-center gap-3'>
          <div className='relative w-full sm:max-w-xs'>
            <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              className='pl-8'
              value={query}
              aria-label={t('helpdesk.tickets.search')}
              placeholder={t('helpdesk.tickets.search')}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Select
            items={STATUSES.map((value) => ({
              value,
              label:
                value === 'all'
                  ? t('helpdesk.filters.allStatuses')
                  : t(`helpdesk.status.${value}`),
            }))}
            value={status}
            onValueChange={(value) => update('status', String(value))}
          >
            <SelectTrigger aria-label={t('helpdesk.fields.status')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className='w-auto min-w-(--anchor-width)'>
              {STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === 'all'
                    ? t('helpdesk.filters.allStatuses')
                    : t(`helpdesk.status.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={PRIORITIES.map((value) => ({
              value,
              label:
                value === 'all'
                  ? t('helpdesk.filters.allPriorities')
                  : t(`helpdesk.priority.${value}`),
            }))}
            value={priority}
            onValueChange={(value) => update('priority', String(value))}
          >
            <SelectTrigger aria-label={t('helpdesk.fields.priority')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className='w-auto min-w-(--anchor-width)'>
              {PRIORITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === 'all'
                    ? t('helpdesk.filters.allPriorities')
                    : t(`helpdesk.priority.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {overdue && (
            <Button
              variant='secondary'
              onClick={() => update('overdue', 'all')}
            >
              {t('helpdesk.filters.overdue')}
              <span className='text-muted-foreground'>×</span>
            </Button>
          )}
          {filtered && (
            <Button
              variant='ghost'
              onClick={() => {
                setQuery('');
                setParams({}, { replace: true });
              }}
            >
              {t('helpdesk.actions.clear')}
            </Button>
          )}
        </div>
        {request.data && request.loading && (
          <span role='status' className='text-sm text-muted-foreground'>
            {t('helpdesk.loading')}
          </span>
        )}
        <HelpdeskError error={request.error} retry={request.reload} />
        {request.loading && !request.data ? (
          <HelpdeskLoading rows={5} />
        ) : (
          !request.error &&
          (rows.length ? (
            <DataTable<Ticket>
              columns={columns}
              data={rows}
              getRowId={(row) => row.id}
              manualPagination
              rowCount={request.data?.meta.total ?? 0}
              paginationState={{ pageIndex: page - 1, pageSize }}
              onPaginationChange={(updater) => {
                const next =
                  typeof updater === 'function'
                    ? updater({ pageIndex: page - 1, pageSize })
                    : updater;
                setParams((old) => {
                  const result = new URLSearchParams(old);
                  result.set('page', String(next.pageIndex + 1));
                  result.set('pageSize', String(next.pageSize));
                  return result;
                });
              }}
              pageSizeOptions={[20, 50, 100]}
              showSelectedCount={false}
              loading={request.loading}
            />
          ) : (
            <Empty className='min-h-56 border border-dashed'>
              <EmptyMedia variant='icon'>
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>
                {t(
                  filtered
                    ? 'helpdesk.tickets.noResults'
                    : 'helpdesk.tickets.emptyTitle',
                )}
              </EmptyTitle>
              <EmptyDescription>
                {t(
                  filtered
                    ? 'helpdesk.tickets.noResultsHint'
                    : 'helpdesk.tickets.emptyDescription',
                )}
              </EmptyDescription>
              <EmptyContent>
                {filtered ? (
                  <Button
                    variant='outline'
                    onClick={() => {
                      setQuery('');
                      setParams({}, { replace: true });
                    }}
                  >
                    {t('helpdesk.actions.clearFilters')}
                  </Button>
                ) : (
                  create
                )}
              </EmptyContent>
            </Empty>
          ))
        )}
      </PageContainer>
      <Outlet />
    </>
  );
}
