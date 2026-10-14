/* eslint-disable react-refresh/only-export-components -- the page and its outlet-context hook are colocated */
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon, TicketIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, Outlet, useOutletContext } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button, buttonVariants } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Input } from '#components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';

import { listTickets } from './api.js';
import { TicketStatusBadge, UrgencyBadge } from './labels.js';
import type { Ticket, TicketListMeta, TicketsOutletContext } from './types.js';

const PAGE_SIZE = 20;

export default function TicketsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [status, setStatus] = useState<string>('all');
  const [urgency, setUrgency] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<readonly Ticket[]>();
  const [meta, setMeta] = useState<TicketListMeta>();
  const [error, setError] = useState<string>();
  const [reloadCount, setReloadCount] = useState(0);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await listTickets(api, {
          status: status === 'all' ? undefined : status,
          urgency: urgency === 'all' ? undefined : urgency,
          q: appliedSearch || undefined,
          page,
          pageSize: PAGE_SIZE,
        });
        if (cancelled) return;
        setError(undefined);
        setItems(result.items);
        setMeta(result.meta);
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof ApiClientError
            ? caught.message
            : t('tickets.error.load'),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, status, urgency, appliedSearch, page, reloadCount, t]);

  const statusItems = useMemo(
    () => [
      { value: 'all', label: t('tickets.filter.allStatuses') },
      ...(['pending', 'processing', 'resolved', 'closed'] as const).map(
        (value) => ({ value, label: t(`tickets.status.${value}`) }),
      ),
    ],
    [t],
  );
  const urgencyItems = useMemo(
    () => [
      { value: 'all', label: t('tickets.filter.allUrgencies') },
      ...(['normal', 'urgent', 'critical'] as const).map((value) => ({
        value,
        label: t(`tickets.urgency.${value}`),
      })),
    ],
    [t],
  );

  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / PAGE_SIZE)) : 1;

  return (
    <PageContainer>
      <PageHeader
        title={t('tickets.title')}
        description={t('tickets.description')}
        actions={
          <Link to='new' className={buttonVariants()}>
            <PlusIcon data-icon='inline-start' />
            {t('tickets.report')}
          </Link>
        }
      />

      <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end'>
        <div className='w-full sm:w-56'>
          <Select
            items={statusItems}
            value={status}
            onValueChange={(value) => {
              setPage(1);
              setStatus(String(value));
            }}
          >
            <SelectTrigger aria-label={t('tickets.filter.status')}>
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
        </div>
        <div className='w-full sm:w-56'>
          <Select
            items={urgencyItems}
            value={urgency}
            onValueChange={(value) => {
              setPage(1);
              setUrgency(String(value));
            }}
          >
            <SelectTrigger aria-label={t('tickets.filter.urgency')}>
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
        </div>
        <form
          className='flex w-full gap-2 sm:w-auto'
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setAppliedSearch(search.trim());
          }}
        >
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('tickets.filter.search')}
            aria-label={t('tickets.filter.search')}
            className='sm:w-64'
          />
          <Button type='submit' variant='outline'>
            {t('tickets.filter.apply')}
          </Button>
        </form>
      </div>

      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!items && !error ? (
        <div className='flex flex-col gap-3'>
          <Skeleton className='h-24 w-full' />
          <Skeleton className='h-24 w-full' />
        </div>
      ) : null}

      {items && items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <TicketIcon />
            </EmptyMedia>
            <EmptyTitle>{t('tickets.empty.title')}</EmptyTitle>
            <EmptyDescription>
              {t('tickets.empty.description')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {items && items.length > 0 ? (
        <ul className='flex flex-col gap-3'>
          {items.map((ticket) => (
            <li key={ticket.id}>
              <TicketRow ticket={ticket} />
            </li>
          ))}
        </ul>
      ) : null}

      {meta && meta.total > PAGE_SIZE ? (
        <div className='flex items-center justify-between text-sm text-muted-foreground'>
          <span>
            {t('tickets.pagination.summary', {
              page,
              total: totalPages,
              count: meta.total,
            })}
          </span>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              {t('tickets.pagination.previous')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={page >= totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              {t('tickets.pagination.next')}
            </Button>
          </div>
        </div>
      ) : null}

      <Outlet context={{ reload } satisfies TicketsOutletContext} />
    </PageContainer>
  );
}

function TicketRow({ ticket }: { readonly ticket: Ticket }): ReactElement {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0 space-y-1'>
            <CardTitle className='text-base'>
              <Link
                to={`/tickets/${ticket.id}`}
                className='underline-offset-4 hover:underline'
              >
                #{ticket.id} {ticket.title}
              </Link>
            </CardTitle>
            <p className='line-clamp-2 text-sm text-muted-foreground'>
              {ticket.description}
            </p>
          </div>
          <div className='flex shrink-0 flex-wrap items-center gap-2'>
            <UrgencyBadge urgency={ticket.urgency} />
            <TicketStatusBadge status={ticket.status} />
          </div>
        </div>
      </CardHeader>
      <CardContent className='flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground'>
        <span>
          {t('tickets.field.reporter')}:{' '}
          {ticket.reporterName ?? ticket.reporterId}
        </span>
        <span>
          {t('tickets.field.assignee')}:{' '}
          {ticket.assigneeName ?? t('tickets.field.unassigned')}
        </span>
        <span>
          {t('tickets.field.createdAt')}:{' '}
          {new Date(ticket.createdAt).toLocaleString()}
        </span>
      </CardContent>
    </Card>
  );
}

/** The context the list hands to its overlays; also what `useOutletContext` resolves for them. */
export function useTicketsContext(): TicketsOutletContext {
  return useOutletContext<TicketsOutletContext>();
}
