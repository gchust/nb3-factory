import { useLocale, useTranslation } from '@nocobase/i18n/client';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
} from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useRef } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';

import {
  TicketOverdueBadge,
  TicketStatusBadge,
  TicketUrgencyBadge,
} from '#components/itsm/status-badge';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import {
  TICKET_STATUSES,
  TICKET_URGENCIES,
  isTicketStatus,
  isTicketUrgency,
  useTicketList,
  type Ticket,
  type TicketListParams,
} from '#hooks/itsm';

const PAGE_SIZE = 20;

/** Everything the caller may see, narrowed by the filters in the URL. */
export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchTimerRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    },
    [],
  );

  const statusParam = searchParams.get('status');
  const status = isTicketStatus(statusParam) ? statusParam : undefined;
  const urgencyParam = searchParams.get('urgency');
  const urgency = isTicketUrgency(urgencyParam) ? urgencyParam : undefined;
  const search = searchParams.get('search')?.trim() ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  // The search box is debounced into the URL rather than held as state, so the URL stays the single source of truth
  // and a reload or a shared link reproduces the same list.
  function handleSearchChange(value: string): void {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (value.trim()) next.set('search', value.trim());
          else next.delete('search');
          next.delete('page');
          return next;
        },
        { replace: true },
      );
    }, 300);
  }

  const params = useMemo<TicketListParams>(
    () => ({
      status,
      urgency,
      search: search || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [status, urgency, search, page],
  );
  const tickets = useTicketList(params);
  const hasFilters =
    search !== '' || status !== undefined || urgency !== undefined;

  function updateParam(name: string, value: string | undefined): void {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(name, value);
      else next.delete(name);
      next.delete('page');
      return next;
    });
  }

  function clearFilters(): void {
    setSearchParams({}, { replace: true });
  }

  const total = tickets.data?.total ?? 0;
  const rows = tickets.data?.items ?? [];
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = (page - 1) * PAGE_SIZE + rows.length;

  return (
    <PageContainer>
      <PageHeader
        title={t('tickets.title')}
        description={t('tickets.description')}
        actions={
          <Button
            render={<Link to={{ pathname: 'new', search: location.search }} />}
          >
            <PlusIcon data-icon='inline-start' />
            {t('tickets.create.action')}
          </Button>
        }
      />

      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative min-w-56 flex-1'>
          <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            key={search}
            defaultValue={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder={t('tickets.search.placeholder')}
            aria-label={t('tickets.search.label')}
            className='pl-8'
          />
        </div>
        <Select
          items={[
            { value: 'all', label: t('tickets.filters.allStatuses') },
            ...TICKET_STATUSES.map((value) => ({
              value,
              label: t(`tickets.status.${value}`),
            })),
          ]}
          value={status ?? 'all'}
          onValueChange={(value: string | null) =>
            updateParam(
              'status',
              value === 'all' ? undefined : (value ?? undefined),
            )
          }
        >
          <SelectTrigger aria-label={t('tickets.filters.statusLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[
              { value: 'all', label: t('tickets.filters.allStatuses') },
              ...TICKET_STATUSES.map((value) => ({
                value,
                label: t(`tickets.status.${value}`),
              })),
            ].map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={[
            { value: 'all', label: t('tickets.filters.allUrgencies') },
            ...TICKET_URGENCIES.map((value) => ({
              value,
              label: t(`tickets.urgency.${value}`),
            })),
          ]}
          value={urgency ?? 'all'}
          onValueChange={(value: string | null) =>
            updateParam(
              'urgency',
              value === 'all' ? undefined : (value ?? undefined),
            )
          }
        >
          <SelectTrigger aria-label={t('tickets.filters.urgencyLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[
              { value: 'all', label: t('tickets.filters.allUrgencies') },
              ...TICKET_URGENCIES.map((value) => ({
                value,
                label: t(`tickets.urgency.${value}`),
              })),
            ].map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters ? (
          <Button type='button' variant='ghost' onClick={clearFilters}>
            {t('tickets.filters.clear')}
          </Button>
        ) : null}
        <Button
          type='button'
          variant='outline'
          size='icon'
          aria-label={t('actions.refresh')}
          disabled={tickets.isFetching}
          onClick={() => void tickets.refetch()}
        >
          <RefreshCwIcon />
        </Button>
      </div>

      {tickets.isError ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('tickets.error.title')}</AlertTitle>
          <AlertDescription>{errorText(tickets.error, t)}</AlertDescription>
          <AlertAction>
            <Button
              type='button'
              size='sm'
              variant='secondary'
              onClick={() => void tickets.refetch()}
            >
              {t('actions.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : tickets.isPending ? (
        <TicketTableSkeleton />
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              {hasFilters
                ? t('tickets.noResults.title')
                : t('tickets.empty.title')}
            </EmptyTitle>
            <EmptyDescription>
              {hasFilters
                ? t('tickets.noResults.description')
                : t('tickets.empty.description')}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {hasFilters ? (
              <Button type='button' variant='outline' onClick={clearFilters}>
                {t('tickets.filters.clear')}
              </Button>
            ) : (
              <Button render={<Link to='new' />}>
                <PlusIcon data-icon='inline-start' />
                {t('tickets.create.action')}
              </Button>
            )}
          </EmptyContent>
        </Empty>
      ) : (
        <TicketTable tickets={rows} />
      )}

      {total > 0 ? (
        <div className='flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground'>
          <span>{t('tickets.pagination.summary', { first, last, total })}</span>
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={page <= 1}
              onClick={() => updatePage(setSearchParams, page - 1)}
            >
              <ArrowLeftIcon data-icon='inline-start' />
              {t('tickets.pagination.previous')}
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={last >= total}
              onClick={() => updatePage(setSearchParams, page + 1)}
            >
              {t('tickets.pagination.next')}
              <ArrowRightIcon data-icon='inline-end' />
            </Button>
          </div>
        </div>
      ) : null}

      <Outlet context={{ reload: () => void tickets.refetch() }} />
    </PageContainer>
  );
}

function updatePage(
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  page: number,
): void {
  setSearchParams((previous) => {
    const next = new URLSearchParams(previous);
    if (page <= 1) next.delete('page');
    else next.set('page', String(page));
    return next;
  });
}

function TicketTable({
  tickets,
}: {
  readonly tickets: readonly Ticket[];
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  return (
    <div className='rounded-xl border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tickets.columns.title')}</TableHead>
            <TableHead>{t('tickets.columns.status')}</TableHead>
            <TableHead>{t('tickets.columns.urgency')}</TableHead>
            <TableHead>{t('tickets.columns.requester')}</TableHead>
            <TableHead>{t('tickets.columns.assignee')}</TableHead>
            <TableHead>{t('tickets.columns.submitted')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => (
            <TableRow key={ticket.id}>
              <TableCell className='max-w-80 whitespace-normal'>
                <Link
                  to={String(ticket.id)}
                  className='font-medium hover:underline'
                >
                  {ticket.title}
                </Link>
                {ticket.overdue ? (
                  <span className='ml-2'>
                    <TicketOverdueBadge />
                  </span>
                ) : null}
              </TableCell>
              <TableCell>
                <TicketStatusBadge status={ticket.status} />
              </TableCell>
              <TableCell>
                <TicketUrgencyBadge urgency={ticket.urgency} />
              </TableCell>
              <TableCell>
                {ticket.requesterName ?? ticket.requesterId}
              </TableCell>
              <TableCell>
                {ticket.assigneeName ?? t('tickets.unassigned')}
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {dateFormat.format(new Date(ticket.submittedAt))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TicketTableSkeleton(): ReactElement {
  return (
    <div className='space-y-2' aria-busy='true'>
      <Skeleton className='h-10 w-full' />
      {[0, 1, 2, 3, 4].map((key) => (
        <Skeleton key={key} className='h-12 w-full' />
      ))}
    </div>
  );
}

function errorText(error: unknown, t: (key: string) => string): string {
  void error;
  return t('tickets.error.description');
}
