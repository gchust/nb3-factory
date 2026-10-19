import { useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SearchIcon,
} from 'lucide-react';
import { useEffect, type ReactElement } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import { Loading } from '#components/loading';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button, buttonVariants } from '#components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { useUrlSearch } from '#hooks/use-url-search';

import {
  getDashboard,
  listTickets,
  shouldRetryRequest,
  type TicketListQuery,
} from './api.js';
import { TicketDashboardSection } from './dashboard.js';
import {
  formatDate,
  STATUS_FILTERS,
  statusLabel,
  URGENCY_FILTERS,
  urgencyLabel,
} from './labels.js';
import { StatusPill, UrgencyPill } from './pills.js';
import {
  TICKET_SORTS,
  type SortOrder,
  type TicketSort,
  type TicketSummary,
} from './types.js';

const PAGE_SIZE = 20;

function readEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | undefined {
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

export default function ItTicketsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const { searchParams, search, inputProps, updateParams, clear } =
    useUrlSearch({ resetParams: ['page'] });
  const createAccess = useCan({
    resource: { type: 'composite', id: 'it.tickets' },
    action: 'create',
  });

  const status = readEnum(searchParams.get('status'), STATUS_FILTERS);
  const urgency = readEnum(searchParams.get('urgency'), URGENCY_FILTERS);
  const sort = readEnum(searchParams.get('sort'), TICKET_SORTS) ?? 'createdAt';
  const order: SortOrder = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
  const parsedPage = Number(searchParams.get('page') ?? '1');
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const query: TicketListQuery = {
    q: search || undefined,
    status,
    urgency,
    sort,
    order,
    page,
    pageSize: PAGE_SIZE,
  };

  const tickets = useQuery({
    queryKey: ['it-tickets', 'list', query],
    queryFn: ({ signal }) => listTickets(api, query, signal),
    placeholderData: keepPreviousData,
    retry: shouldRetryRequest,
  });
  const dashboard = useQuery({
    queryKey: ['it-tickets', 'dashboard'],
    queryFn: ({ signal }) => getDashboard(api, signal),
    staleTime: 15_000,
    retry: shouldRetryRequest,
  });

  const meta = tickets.data?.meta;
  const items = tickets.data?.data ?? [];
  const totalPages = meta
    ? Math.max(1, Math.ceil(meta.total / meta.pageSize))
    : 1;
  const activeFilters = Boolean(search || status || urgency);

  useEffect(() => {
    if (meta && meta.total > 0 && page > totalPages) {
      updateParams((params) => {
        if (totalPages === 1) params.delete('page');
        else params.set('page', String(totalPages));
      });
    }
  }, [meta, page, totalPages, updateParams]);

  function setFilter(name: 'status' | 'urgency', value: string): void {
    updateParams((params) => {
      if (value === 'all') params.delete(name);
      else params.set(name, value);
      params.delete('page');
    });
  }

  function changeSort(next: TicketSort): void {
    updateParams((params) => {
      const nextOrder = sort === next && order === 'desc' ? 'asc' : 'desc';
      params.set('sort', next);
      params.set('order', nextOrder);
      params.delete('page');
    });
  }

  function changePage(next: number): void {
    updateParams((params) => {
      if (next <= 1) params.delete('page');
      else params.set('page', String(next));
    });
  }

  const listErrorStatus =
    tickets.error &&
    typeof tickets.error === 'object' &&
    'status' in tickets.error
      ? (tickets.error as { status?: number }).status
      : undefined;

  return (
    <PageContainer>
      <PageHeader
        title={t('itTickets.title')}
        description={t('itTickets.description')}
        actions={
          createAccess.can ? (
            <Link
              className={buttonVariants()}
              to={{ pathname: 'new', search: location.search }}
            >
              <PlusIcon data-icon='inline-start' />
              {t('itTickets.actions.newTicket')}
            </Link>
          ) : null
        }
      />

      <TicketDashboardSection
        dashboard={dashboard.data?.data}
        loading={dashboard.isPending}
        error={dashboard.error}
        onRetry={() => void dashboard.refetch()}
      />

      <section className='space-y-3' aria-labelledby='it-tickets-heading'>
        <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
          <div>
            <h2 id='it-tickets-heading' className='text-base font-medium'>
              {t('itTickets.list.title')}
            </h2>
            <p className='text-sm text-muted-foreground'>
              {t('itTickets.list.description')}
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='relative'>
              <SearchIcon
                className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground'
                aria-hidden
              />
              <Input
                type='search'
                placeholder={t('itTickets.filters.search')}
                aria-label={t('itTickets.filters.search')}
                className='w-56 pl-8'
                {...inputProps}
              />
            </div>
            <Select
              value={status ?? 'all'}
              onValueChange={(next: string | null) => {
                if (next) setFilter('status', next);
              }}
            >
              <SelectTrigger
                className='w-40'
                aria-label={t('itTickets.filters.status')}
              >
                <SelectValue>
                  {status
                    ? status === 'open'
                      ? t('itTickets.filters.openStatuses')
                      : statusLabel(t, status)
                    : t('itTickets.filters.allStatuses')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>
                  {t('itTickets.filters.allStatuses')}
                </SelectItem>
                {STATUS_FILTERS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value === 'open'
                      ? t('itTickets.filters.openStatuses')
                      : statusLabel(t, value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={urgency ?? 'all'}
              onValueChange={(next: string | null) => {
                if (next) setFilter('urgency', next);
              }}
            >
              <SelectTrigger
                className='w-36'
                aria-label={t('itTickets.filters.urgency')}
              >
                <SelectValue>
                  {urgency
                    ? urgencyLabel(t, urgency)
                    : t('itTickets.filters.allUrgencies')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>
                  {t('itTickets.filters.allUrgencies')}
                </SelectItem>
                {URGENCY_FILTERS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {urgencyLabel(t, value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeFilters ? (
              <Button
                variant='ghost'
                onClick={() => {
                  clear((params) => {
                    params.delete('status');
                    params.delete('urgency');
                  });
                }}
              >
                {t('itTickets.filters.clear')}
              </Button>
            ) : null}
          </div>
        </div>

        <div className='overflow-hidden rounded-xl border border-border bg-card'>
          {tickets.isPending ? (
            <Loading className='h-64' />
          ) : tickets.error ? (
            <div className='p-4'>
              {listErrorStatus === 401 ? (
                <SessionExpiredAlert />
              ) : (
                <Alert variant='destructive'>
                  <AlertTitle>{t('itTickets.list.loadFailed')}</AlertTitle>
                  <AlertDescription className='flex flex-wrap items-center justify-between gap-3'>
                    <span>{t('itTickets.errors.requestFailed')}</span>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => void tickets.refetch()}
                    >
                      {t('itTickets.actions.retry')}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : items.length === 0 ? (
            <Empty className='min-h-64 border-0'>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <SearchIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {activeFilters
                    ? t('itTickets.list.noMatches')
                    : t('itTickets.list.emptyTitle')}
                </EmptyTitle>
                <EmptyDescription>
                  {activeFilters
                    ? t('itTickets.list.noMatchesDescription')
                    : t('itTickets.list.emptyDescription')}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {activeFilters ? (
                  <Button
                    variant='outline'
                    onClick={() => {
                      clear((params) => {
                        params.delete('status');
                        params.delete('urgency');
                      });
                    }}
                  >
                    {t('itTickets.filters.clear')}
                  </Button>
                ) : createAccess.can ? (
                  <Link
                    className={buttonVariants()}
                    to={{ pathname: 'new', search: location.search }}
                  >
                    <PlusIcon data-icon='inline-start' />
                    {t('itTickets.actions.newTicket')}
                  </Link>
                ) : null}
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-24'>
                    <SortButton
                      label={t('itTickets.columns.number')}
                      active={sort === 'number'}
                      order={order}
                      onClick={() => changeSort('number')}
                    />
                  </TableHead>
                  <TableHead>
                    <SortButton
                      label={t('itTickets.columns.title')}
                      active={sort === 'title'}
                      order={order}
                      onClick={() => changeSort('title')}
                    />
                  </TableHead>
                  <TableHead>{t('itTickets.columns.status')}</TableHead>
                  <TableHead>{t('itTickets.columns.urgency')}</TableHead>
                  <TableHead>{t('itTickets.columns.requester')}</TableHead>
                  <TableHead>{t('itTickets.columns.assignee')}</TableHead>
                  <TableHead>
                    <SortButton
                      label={t('itTickets.columns.createdAt')}
                      active={sort === 'createdAt'}
                      order={order}
                      onClick={() => changeSort('createdAt')}
                    />
                  </TableHead>
                  <TableHead>
                    <SortButton
                      label={t('itTickets.columns.updatedAt')}
                      active={sort === 'updatedAt'}
                      order={order}
                      onClick={() => changeSort('updatedAt')}
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((ticket) => (
                  <TicketRow key={ticket.id} ticket={ticket} />
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {meta && meta.total > 0 ? (
          <div className='flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between'>
            <p>
              {t('itTickets.pagination.summary', {
                total: meta.total,
                page: meta.page,
                pages: totalPages,
              })}
            </p>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={page <= 1}
                onClick={() => changePage(page - 1)}
              >
                <ChevronLeftIcon data-icon='inline-start' />
                {t('itTickets.pagination.previous')}
              </Button>
              <Button
                variant='outline'
                size='sm'
                disabled={page >= totalPages}
                onClick={() => changePage(page + 1)}
              >
                {t('itTickets.pagination.next')}
                <ChevronRightIcon data-icon='inline-end' />
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <Outlet />
    </PageContainer>
  );
}

function SortButton({
  label,
  active,
  order,
  onClick,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly order: SortOrder;
  readonly onClick: () => void;
}): ReactElement {
  const Icon = !active
    ? ArrowUpDownIcon
    : order === 'asc'
      ? ArrowUpIcon
      : ArrowDownIcon;
  return (
    <button
      type='button'
      className='-mx-2 inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted'
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
    >
      {label}
      <Icon className='size-3.5 text-muted-foreground' aria-hidden />
    </button>
  );
}

function TicketRow({
  ticket,
}: {
  readonly ticket: TicketSummary;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  return (
    <TableRow>
      <TableCell className='font-mono text-xs text-muted-foreground'>
        {ticket.number}
      </TableCell>
      <TableCell className='max-w-80 min-w-48'>
        <Link
          to={{ pathname: String(ticket.id), search: location.search }}
          className='line-clamp-2 font-medium underline-offset-4 hover:underline'
        >
          {ticket.title}
        </Link>
      </TableCell>
      <TableCell>
        <StatusPill status={ticket.status} t={t} />
      </TableCell>
      <TableCell>
        <UrgencyPill urgency={ticket.urgency} t={t} />
      </TableCell>
      <TableCell className='whitespace-nowrap'>
        {ticket.requesterName}
      </TableCell>
      <TableCell className='whitespace-nowrap'>
        {ticket.assigneeName ?? (
          <span className='text-muted-foreground'>
            {t('itTickets.unassigned')}
          </span>
        )}
      </TableCell>
      <TableCell className='whitespace-nowrap text-muted-foreground'>
        {formatDate(ticket.createdAt, i18n.language)}
      </TableCell>
      <TableCell className='whitespace-nowrap text-muted-foreground'>
        {formatDate(ticket.updatedAt, i18n.language)}
      </TableCell>
    </TableRow>
  );
}
