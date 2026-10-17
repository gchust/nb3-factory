import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { InboxIcon, PlusIcon, SearchIcon, UserRoundIcon } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';

import type {
  TicketListResult,
  TicketPriority,
  TicketStatus,
  TicketSummary,
} from './types.js';
import { formatDate, requestErrorMessage } from './ticket-format.js';
import { OverdueBadge, PriorityBadge, TicketStatusBadge } from './ticket-ui.js';

const PAGE_SIZE = 20;

const STATUSES: readonly TicketStatus[] = [
  'open',
  'assigned',
  'resolved',
  'closed',
];
const PRIORITIES: readonly TicketPriority[] = [
  'low',
  'normal',
  'high',
  'urgent',
];

export default function TicketListPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [status, setStatus] = useState<'all' | TicketStatus>('all');
  const [priority, setPriority] = useState<'all' | TicketPriority>('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const requestKey = JSON.stringify([page, priority, search, status]);
  const [state, setState] = useState<{
    readonly key: string;
    readonly result?: TicketListResult;
    readonly denied?: boolean;
    readonly error?: string;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    api
      .request<{ data: TicketListResult }>({
        path: 'service-desk/tickets',
        query: {
          page,
          pageSize: PAGE_SIZE,
          status: status === 'all' ? undefined : status,
          priority: priority === 'all' ? undefined : priority,
          q: search.trim() || undefined,
        },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!controller.signal.aborted)
          setState({ key: requestKey, result: data });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiClientError && cause.status === 403) {
          setState({ key: requestKey, denied: true });
          return;
        }
        setState({
          key: requestKey,
          error: requestErrorMessage(cause, t),
        });
      });
    return () => controller.abort();
  }, [api, page, priority, requestKey, search, status, t]);

  const current = state?.key === requestKey ? state : undefined;
  const result = current?.result;
  const loading = !current;
  const error = current?.error;
  const denied = current?.denied;

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setPage(1);
    setSearch(query);
  };

  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / PAGE_SIZE))
    : 1;

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('serviceDesk.tickets.title', { defaultValue: 'Tickets' })}
        description={t('serviceDesk.tickets.description', {
          defaultValue:
            'Track requests from submission through resolution and confirmation.',
        })}
        actions={
          result?.canCreate ? (
            <Button render={<Link to='new' />}>
              <PlusIcon data-icon='inline-start' />
              {t('serviceDesk.ticket.new', { defaultValue: 'New ticket' })}
            </Button>
          ) : null
        }
      />

      <div className='flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center'>
        <form onSubmit={onSubmit} className='flex min-w-0 flex-1 gap-2'>
          <div className='relative min-w-0 flex-1'>
            <SearchIcon className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('serviceDesk.tickets.search', {
                defaultValue: 'Search tickets…',
              })}
              aria-label={t('serviceDesk.tickets.search', {
                defaultValue: 'Search tickets…',
              })}
              className='pl-8'
            />
          </div>
          <Button type='submit' variant='outline'>
            {t('serviceDesk.actions.search', { defaultValue: 'Search' })}
          </Button>
        </form>
        <div className='flex flex-wrap gap-2'>
          <Select
            items={[
              {
                value: 'all',
                label: t('serviceDesk.filters.allStatuses', {
                  defaultValue: 'All statuses',
                }),
              },
              ...STATUSES.map((value) => ({
                value,
                label: t(`serviceDesk.status.${value}`),
              })),
            ]}
            value={status}
            onValueChange={(next: string | null) => {
              if (!next) return;
              setStatus(next as 'all' | TicketStatus);
              setPage(1);
            }}
          >
            <SelectTrigger
              size='sm'
              className='w-36'
              aria-label={t('serviceDesk.ticket.status', {
                defaultValue: 'Status',
              })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>
                {t('serviceDesk.filters.allStatuses', {
                  defaultValue: 'All statuses',
                })}
              </SelectItem>
              {STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`serviceDesk.status.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={[
              {
                value: 'all',
                label: t('serviceDesk.filters.allPriorities', {
                  defaultValue: 'All priorities',
                }),
              },
              ...PRIORITIES.map((value) => ({
                value,
                label: t(`serviceDesk.priority.${value}`),
              })),
            ]}
            value={priority}
            onValueChange={(next: string | null) => {
              if (!next) return;
              setPriority(next as 'all' | TicketPriority);
              setPage(1);
            }}
          >
            <SelectTrigger
              size='sm'
              className='w-36'
              aria-label={t('serviceDesk.ticket.priority', {
                defaultValue: 'Priority',
              })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>
                {t('serviceDesk.filters.allPriorities', {
                  defaultValue: 'All priorities',
                })}
              </SelectItem>
              {PRIORITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`serviceDesk.priority.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && !result ? (
        <Loading className='py-24' />
      ) : denied ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>
              {t('serviceDesk.tickets.deniedTitle', {
                defaultValue: 'Tickets are not available',
              })}
            </EmptyTitle>
            <EmptyDescription>
              {t('serviceDesk.tickets.deniedDescription', {
                defaultValue:
                  'Your account does not have permission to view service desk tickets.',
              })}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : error ? (
        <p className='rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive'>
          {error}
        </p>
      ) : result ? (
        result.items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>
                {t('serviceDesk.tickets.emptyTitle', {
                  defaultValue: 'No tickets yet',
                })}
              </EmptyTitle>
              <EmptyDescription>
                {search || status !== 'all' || priority !== 'all'
                  ? t('serviceDesk.tickets.emptyFiltered', {
                      defaultValue:
                        'No tickets match these filters. Try clearing them.',
                    })
                  : t('serviceDesk.tickets.emptyDescription', {
                      defaultValue:
                        'Tickets submitted by your team will appear here.',
                    })}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className='flex flex-col gap-3'>
            <div className='flex items-center justify-between gap-3'>
              <p className='text-sm text-muted-foreground'>
                {t('serviceDesk.tickets.count', {
                  count: result.total,
                  defaultValue: '{{count}} ticket(s)',
                })}
              </p>
              {loading ? <Loading className='flex-row gap-2' /> : null}
            </div>
            <ul className='flex flex-col gap-3'>
              {result.items.map((ticket) => (
                <li key={ticket.id}>
                  <TicketRow ticket={ticket} />
                </li>
              ))}
            </ul>
            <div className='flex flex-wrap items-center justify-between gap-3 pt-2'>
              <p className='text-sm text-muted-foreground'>
                {t('serviceDesk.tickets.page', {
                  page,
                  totalPages,
                  defaultValue: 'Page {{page}} of {{totalPages}}',
                })}
              </p>
              <div className='flex gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  {t('serviceDesk.actions.previous', {
                    defaultValue: 'Previous',
                  })}
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((current) => current + 1)}
                >
                  {t('serviceDesk.actions.next', { defaultValue: 'Next' })}
                </Button>
              </div>
            </div>
          </div>
        )
      ) : null}
      <Outlet />
    </PageContainer>
  );
}

function TicketRow({
  ticket,
}: {
  readonly ticket: TicketSummary;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Link
      to={String(ticket.id)}
      className='block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-muted/20'
    >
      <div className='flex flex-col gap-3'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-xs font-medium text-muted-foreground tabular-nums'>
            #{ticket.id}
          </span>
          <TicketStatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          {ticket.overdue ? <OverdueBadge /> : null}
        </div>
        <div className='flex flex-col gap-1'>
          <h2 className='font-heading text-base font-medium tracking-tight'>
            {ticket.title}
          </h2>
          <p className='line-clamp-2 text-sm text-muted-foreground'>
            {t('serviceDesk.ticket.updatedAt', {
              date: formatDate(ticket.updatedAt),
              defaultValue: 'Updated {{date}}',
            })}
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground'>
          <span className='inline-flex items-center gap-1.5'>
            <UserRoundIcon className='size-3.5' />
            {ticket.requesterName ??
              t('serviceDesk.ticket.unknownUser', {
                defaultValue: 'Unknown user',
              })}
          </span>
          <span>
            {ticket.assigneeName
              ? t('serviceDesk.ticket.assignedTo', {
                  name: ticket.assigneeName,
                  defaultValue: 'Assigned to {{name}}',
                })
              : t('serviceDesk.ticket.unassigned', {
                  defaultValue: 'Unassigned',
                })}
          </span>
          {ticket.commentCount > 0 ? (
            <span>
              {t('serviceDesk.ticket.comments', {
                count: ticket.commentCount,
                defaultValue: '{{count}} comment(s)',
              })}
            </span>
          ) : null}
          {ticket.attachments.length > 0 ? (
            <span>
              {t('serviceDesk.ticket.attachmentsCount', {
                count: ticket.attachments.length,
                defaultValue: '{{count}} attachment(s)',
              })}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
