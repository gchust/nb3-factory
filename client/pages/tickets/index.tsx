import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useSearchParams } from 'react-router';
import { PlusIcon, SearchIcon, TicketIcon } from 'lucide-react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Skeleton } from '#components/ui/skeleton';
import { Alert, AlertDescription } from '#components/ui/alert';

import {
  TICKET_CATEGORIES,
  TICKET_STATES,
  errorText,
  useTicketLabels,
  useTicketPermission,
  useTicketsApi,
  type Ticket,
  type TicketCategory,
  type TicketState,
} from './shared.js';

function statusBadge(status: TicketState) {
  return status === 'escalated'
    ? 'destructive'
    : status === 'processing'
      ? 'default'
      : status === 'resolved'
        ? 'secondary'
        : 'outline';
}

export default function TicketsPage(): ReactElement {
  const { t, formatDate, category, priority, status } = useTicketLabels();
  const [params, setParams] = useSearchParams();
  const canCreate = useTicketPermission('create');
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = [20, 50, 100].includes(Number(params.get('pageSize')))
    ? Number(params.get('pageSize'))
    : 20;
  const statusFilter = params.get('status') as TicketState | null;
  const categoryFilter = params.get('category') as TicketCategory | null;
  const query = params.get('q') ?? '';
  const [searchText, setSearchText] = useState(query);
  const search = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(categoryFilter ? { category: categoryFilter } : {}),
    ...(query ? { q: query } : {}),
  });
  const request = useTicketsApi<{
    data: Ticket[];
    meta: { page: number; pageSize: number; total: number };
  }>(`tickets?${search}`);
  const rows = request.data?.data ?? [];
  const total = request.data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const setFilter = useCallback(
    (key: string, value: string) => {
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
    },
    [setParams],
  );
  useEffect(() => {
    if (searchText === query) return;
    const timer = window.setTimeout(() => setFilter('q', searchText), 300);
    return () => window.clearTimeout(timer);
  }, [query, searchText, setFilter]);
  const pageLink = (nextPage: number) => {
    const next = new URLSearchParams(params);
    if (nextPage <= 1) next.delete('page');
    else next.set('page', String(nextPage));
    return { pathname: '.', search: next.toString() };
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('helpdesk.list.title')}
        description={t('helpdesk.list.description')}
        actions={
          canCreate ? (
            <Button nativeButton={false} render={<Link to='new' />}>
              <PlusIcon />
              {t('helpdesk.newTicket')}
            </Button>
          ) : undefined
        }
      />

      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <div className='relative sm:max-w-xs sm:flex-1'>
          <SearchIcon className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            className='pl-9'
            value={searchText}
            placeholder={t('helpdesk.list.search')}
            aria-label={t('helpdesk.list.search')}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
        <Select
          value={statusFilter ?? 'all'}
          onValueChange={(value) => setFilter('status', value ?? 'all')}
        >
          <SelectTrigger aria-label={t('helpdesk.fields.status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>
              {t('helpdesk.list.allStatuses')}
            </SelectItem>
            {TICKET_STATES.map((value) => (
              <SelectItem key={value} value={value}>
                {status(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={categoryFilter ?? 'all'}
          onValueChange={(value) => setFilter('category', value ?? 'all')}
        >
          <SelectTrigger aria-label={t('helpdesk.fields.category')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>
              {t('helpdesk.list.allCategories')}
            </SelectItem>
            {TICKET_CATEGORIES.map((value) => (
              <SelectItem key={value} value={value}>
                {category(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {request.error ? (
        <Alert variant='destructive'>
          <AlertDescription>
            {t('helpdesk.list.loadFailed')}
            <span className='block text-xs opacity-80'>
              {errorText(request.error, '')}
            </span>
            <Button variant='outline' size='sm' onClick={request.reload}>
              {t('helpdesk.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : request.loading && !request.data ? (
        <div className='space-y-3'>
          <Skeleton className='h-14 w-full' />
          <Skeleton className='h-14 w-full' />
          <Skeleton className='h-14 w-full' />
        </div>
      ) : rows.length === 0 ? (
        <Empty className='min-h-56 border border-dashed'>
          <EmptyMedia variant='icon'>
            <TicketIcon />
          </EmptyMedia>
          <EmptyTitle>{t('helpdesk.list.empty')}</EmptyTitle>
          <EmptyDescription>{t('helpdesk.list.emptyHint')}</EmptyDescription>
          {canCreate && (
            <EmptyContent>
              <Button nativeButton={false} render={<Link to='new' />}>
                <PlusIcon />
                {t('helpdesk.newTicket')}
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <div className='divide-y overflow-hidden rounded-xl border bg-card'>
            {rows.map((ticket) => (
              <Link
                key={ticket.id}
                to={{ pathname: ticket.id, search: params.toString() }}
                className='flex flex-col gap-3 p-4 transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between'
              >
                <div className='min-w-0 space-y-1'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='font-mono text-xs text-muted-foreground'>
                      {ticket.ticketNo}
                    </span>
                    <Badge variant={statusBadge(ticket.status)}>
                      {status(ticket.status)}
                    </Badge>
                    <Badge variant='outline'>{priority(ticket.priority)}</Badge>
                  </div>
                  <p className='truncate font-medium'>{ticket.title}</p>
                  <p className='text-xs text-muted-foreground'>
                    {category(ticket.category)} · {formatDate(ticket.updatedAt)}
                  </p>
                </div>
                <div className='shrink-0 text-xs text-muted-foreground sm:text-right'>
                  <p>{t('helpdesk.fields.assignee')}</p>
                  <p className='font-mono'>{ticket.assigneeId ?? '—'}</p>
                </div>
              </Link>
            ))}
          </div>
          <div className='flex items-center justify-between gap-3 text-sm text-muted-foreground'>
            <span>{t('helpdesk.list.total', { total })}</span>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={page <= 1}
                nativeButton={false}
                render={<Link to={pageLink(page - 1)} />}
              >
                {t('helpdesk.list.previous')}
              </Button>
              <span>{t('helpdesk.list.page', { page, pages })}</span>
              <Button
                variant='outline'
                size='sm'
                disabled={page >= pages}
                nativeButton={false}
                render={<Link to={pageLink(page + 1)} />}
              >
                {t('helpdesk.list.next')}
              </Button>
            </div>
          </div>
        </>
      )}
      <Outlet />
    </PageContainer>
  );
}
