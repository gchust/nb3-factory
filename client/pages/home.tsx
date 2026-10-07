import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircleIcon,
  ArrowRightIcon,
  ClockIcon,
  InboxIcon,
  PackageCheckIcon,
  PlusIcon,
  TicketIcon,
  WrenchIcon,
} from 'lucide-react';
import { type ReactElement, useEffect, useReducer, useState } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { fetchStats, fetchTickets, fetchViewer } from './tickets/api.js';
import { TicketUrgencyBadge } from './tickets/status-badge.js';
import {
  isOverseer,
  type Ticket,
  type TicketStats,
  type Viewer,
} from './tickets/types.js';

interface Dashboard {
  readonly viewer: Viewer;
  readonly stats: TicketStats;
  readonly pending: Ticket[];
  readonly overdue: Ticket[];
}

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = `dashboard:${reloadCount}`;
  const [result, setResult] = useState<{
    readonly key: string;
    readonly dashboard?: Dashboard;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = `dashboard:${reloadCount}`;
    Promise.all([
      fetchViewer(api, controller.signal),
      fetchStats(api, controller.signal),
      fetchTickets(
        api,
        { status: 'pending', pageSize: 100 },
        controller.signal,
      ),
      // Overdue tickets span every open status, not just pending, so they are a
      // separate query against the `overdue` filter.
      fetchTickets(api, { overdue: true, pageSize: 100 }, controller.signal),
    ]).then(
      ([viewer, stats, pendingPage, overduePage]) => {
        if (!controller.signal.aborted) {
          setResult({
            key,
            dashboard: {
              viewer,
              stats,
              pending: pendingPage.data,
              overdue: overduePage.data,
            },
          });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const dashboard = loading ? undefined : result?.dashboard;

  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('home.error.title')}</AlertTitle>
        <AlertDescription>{t('home.error.sessionExpired')}</AlertDescription>
      </Alert>
    );
  } else if (error) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('home.error.title')}</AlertTitle>
        <AlertDescription>{t('home.error.requestFailed')}</AlertDescription>
        <AlertAction>
          <Button variant='outline' size='sm' onClick={reload}>
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!dashboard) {
    content = (
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className='h-28 w-full' />
        ))}
      </div>
    );
  } else {
    content = <DashboardBody dashboard={dashboard} />;
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('home.title')}
        description={
          dashboard
            ? t('home.greeting', { name: dashboard.viewer.name })
            : t('home.description')
        }
        actions={
          <Button render={<Link to='/tickets/new' />} nativeButton={false}>
            <PlusIcon data-icon='inline-start' />
            {t('tickets.create.action')}
          </Button>
        }
      />
      {content}
    </PageContainer>
  );
}

function DashboardBody({
  dashboard,
}: {
  readonly dashboard: Dashboard;
}): ReactElement {
  const { t } = useTranslation();
  const { viewer, stats, pending, overdue } = dashboard;
  const overseer = isOverseer(viewer.role);

  const cards = [
    {
      key: 'pending',
      icon: <InboxIcon />,
      label: t('home.stats.pending'),
      value: stats.pending,
      hint: t('home.stats.pendingHint'),
    },
    {
      key: 'processing',
      icon: <WrenchIcon />,
      label: t('home.stats.processing'),
      value: stats.processing,
      hint: t('home.stats.processingHint'),
    },
    {
      key: 'overdue',
      icon: <ClockIcon />,
      label: t('home.stats.overdue'),
      value: stats.overdue,
      hint: t('home.stats.overdueHint'),
      destructive: stats.overdue > 0,
    },
    {
      key: 'resolved',
      icon: <PackageCheckIcon />,
      label: t('home.stats.resolved'),
      value: stats.resolved,
      hint: t('home.stats.resolvedHint'),
    },
  ];

  return (
    <div className='space-y-6'>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {cards.map((card) => (
          <Card key={card.key}>
            <CardHeader>
              <CardDescription className='flex items-center gap-2'>
                <span
                  className={
                    card.destructive
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                  }
                >
                  {card.icon}
                </span>
                {card.label}
              </CardDescription>
              <CardTitle
                className={
                  card.destructive ? 'text-3xl text-destructive' : 'text-3xl'
                }
              >
                {card.value}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-xs text-muted-foreground'>{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className='grid gap-6 lg:grid-cols-2'>
        <OverdueTickets tickets={overdue} total={stats.overdue} />
        <Workload stats={stats} />
      </div>

      {overseer ? <PendingDispatch tickets={pending} /> : <RecentOwnTickets />}

      <div className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          render={<Link to='/tickets' />}
          nativeButton={false}
        >
          <TicketIcon data-icon='inline-start' />
          {t('home.actions.allTickets')}
        </Button>
        <Button
          variant='outline'
          render={<Link to='/tickets/new' />}
          nativeButton={false}
        >
          <PlusIcon data-icon='inline-start' />
          {t('tickets.create.action')}
        </Button>
      </div>
    </div>
  );
}

function OverdueTickets({
  tickets,
  total,
}: {
  readonly tickets: readonly Ticket[];
  readonly total: number;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <ClockIcon className='size-4 text-destructive' />
          {t('home.overdue.title')}
        </CardTitle>
        <CardDescription>{t('home.overdue.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {tickets.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('home.overdue.empty')}
          </p>
        ) : (
          <ul className='divide-y'>
            {tickets.slice(0, 5).map((ticket) => (
              <li key={ticket.id}>
                <Link
                  to={`/tickets/${ticket.id}`}
                  className='flex items-center justify-between gap-3 py-3 hover:bg-muted/50'
                >
                  <span className='min-w-0'>
                    <span className='block truncate text-sm font-medium'>
                      {ticket.title}
                    </span>
                    <span className='font-mono text-xs text-muted-foreground'>
                      {ticket.ticketNo}
                    </span>
                  </span>
                  <TicketUrgencyBadge urgency={ticket.urgency} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {total > tickets.length ? (
          <Button
            variant='link'
            size='sm'
            className='mt-2 px-0'
            render={<Link to='/tickets?overdue=true' />}
            nativeButton={false}
          >
            {t('home.viewAll')}
            <ArrowRightIcon data-icon='inline-end' />
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Workload({ stats }: { readonly stats: TicketStats }): ReactElement {
  const { t } = useTranslation();
  const max = Math.max(
    1,
    ...stats.engineerWorkload.map((row) => row.open + row.resolved),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <WrenchIcon className='size-4 text-muted-foreground' />
          {t('home.workload.title')}
        </CardTitle>
        <CardDescription>{t('home.workload.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {stats.engineerWorkload.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('home.workload.empty')}
          </p>
        ) : (
          <ul className='space-y-4'>
            {stats.engineerWorkload.map((row) => (
              <li key={row.userId} className='space-y-2'>
                <div className='flex items-center justify-between gap-2 text-sm'>
                  <span className='truncate font-medium'>{row.name}</span>
                  <span className='shrink-0 text-muted-foreground'>
                    {t('home.workload.summary', {
                      open: row.open,
                      resolved: row.resolved,
                    })}
                  </span>
                </div>
                <div className='flex h-2 overflow-hidden rounded-full bg-muted'>
                  <div
                    className='bg-primary'
                    style={{ width: `${(row.open / max) * 100}%` }}
                  />
                  <div
                    className='bg-primary/40'
                    style={{ width: `${(row.resolved / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PendingDispatch({
  tickets,
}: {
  readonly tickets: readonly Ticket[];
}): ReactElement {
  const { t } = useTranslation();
  const unassigned = tickets.filter((ticket) => !ticket.assigneeId);
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <InboxIcon className='size-4 text-muted-foreground' />
          {t('home.dispatch.title')}
        </CardTitle>
        <CardDescription>{t('home.dispatch.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {unassigned.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('home.dispatch.empty')}
          </p>
        ) : (
          <ul className='divide-y'>
            {unassigned.slice(0, 5).map((ticket) => (
              <li key={ticket.id}>
                <Link
                  to={`/tickets/${ticket.id}`}
                  className='flex items-center justify-between gap-3 py-3 hover:bg-muted/50'
                >
                  <span className='min-w-0'>
                    <span className='block truncate text-sm font-medium'>
                      {ticket.title}
                    </span>
                    <span className='font-mono text-xs text-muted-foreground'>
                      {ticket.ticketNo}
                    </span>
                  </span>
                  <Badge variant='outline'>{t('tickets.unassigned')}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RecentOwnTickets(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [tickets, setTickets] = useState<Ticket[]>();
  useEffect(() => {
    const controller = new AbortController();
    fetchTickets(api, { pageSize: 5 }, controller.signal).then(
      ({ data }) => {
        if (!controller.signal.aborted) setTickets(data);
      },
      () => {
        if (!controller.signal.aborted) setTickets([]);
      },
    );
    return () => controller.abort();
  }, [api]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <TicketIcon className='size-4 text-muted-foreground' />
          {t('home.recent.title')}
        </CardTitle>
        <CardDescription>{t('home.recent.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {tickets === undefined ? (
          <div className='space-y-2'>
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className='h-8 w-full' />
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('home.recent.empty')}
          </p>
        ) : (
          <ul className='divide-y'>
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  to={`/tickets/${ticket.id}`}
                  className='flex items-center justify-between gap-3 py-3 hover:bg-muted/50'
                >
                  <span className='min-w-0 truncate text-sm font-medium'>
                    {ticket.title}
                  </span>
                  <Badge variant='outline'>{ticket.ticketNo}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
