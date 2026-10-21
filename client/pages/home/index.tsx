import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowRightIcon,
  CirclePlusIcon,
  ClockIcon,
  InboxIcon,
  LifeBuoyIcon,
  TriangleAlertIcon,
  UsersIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { Skeleton } from '#components/ui/skeleton';

import { TicketsClient } from '../tickets/api.js';
import {
  TicketOverdueBadge,
  TicketPriorityBadge,
  TicketStatusBadge,
} from '../tickets/badges.js';
import { formatDate } from '../tickets/format.js';
import type { TicketDashboard, TicketListItem } from '../tickets/types.js';

function StatusOf({
  ticket,
}: {
  readonly ticket: TicketListItem;
}): ReactElement {
  return (
    <span className='flex flex-wrap items-center gap-1.5'>
      <TicketStatusBadge status={ticket.status} />
      <TicketOverdueBadge overdue={ticket.overdue} />
    </span>
  );
}

function TicketQueue({
  title,
  description,
  tickets,
  empty,
}: {
  readonly title: string;
  readonly description: string;
  readonly tickets: readonly TicketListItem[];
  readonly empty: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {tickets.length === 0 ? (
          <p className='rounded-lg border border-dashed p-4 text-sm text-muted-foreground'>
            {empty}
          </p>
        ) : (
          <ul className='flex flex-col divide-y'>
            {tickets.map((ticket) => (
              <li key={ticket.id} className='py-3 first:pt-0 last:pb-0'>
                <Link
                  to={`/tickets/${encodeURIComponent(ticket.id)}`}
                  className='group flex items-start justify-between gap-3 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
                >
                  <span className='flex min-w-0 flex-col gap-1'>
                    <span className='truncate text-sm font-medium group-hover:underline'>
                      {ticket.title}
                    </span>
                    <span className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
                      <span className='font-mono'>{ticket.ticketNo}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {ticket.requester?.name ??
                          t('tickets.unknownRequester')}
                      </span>
                      <span aria-hidden>·</span>
                      <span>{formatDate(ticket.createdAt)}</span>
                    </span>
                  </span>
                  <span className='flex shrink-0 flex-col items-end gap-1'>
                    <StatusOf ticket={ticket} />
                    <TicketPriorityBadge priority={ticket.priority} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const client = useMemo(() => new TicketsClient(api), [api]);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    readonly data?: TicketDashboard;
    readonly error?: unknown;
    readonly loading: boolean;
  }>({ loading: true });

  useEffect(() => {
    let active = true;
    void client.dashboard().then(
      (data) => {
        if (active) setState({ data, loading: false });
      },
      (error: unknown) => {
        if (active) setState({ error, loading: false });
      },
    );
    return () => {
      active = false;
    };
  }, [client, revision]);

  const dashboard = state.data;
  const serviceDesk = dashboard?.viewer.serviceDesk ?? false;

  if (state.loading) {
    return (
      <PageContainer className='mx-auto max-w-6xl'>
        <Skeleton className='h-20 w-full' />
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className='h-28 w-full' />
          ))}
        </div>
        <Skeleton className='h-64 w-full' />
      </PageContainer>
    );
  }

  if (!dashboard) {
    return (
      <PageContainer className='mx-auto max-w-6xl'>
        <PageHeader
          title={t('home.title')}
          description={t('home.description')}
        />
        <Alert variant='destructive'>
          <AlertDescription>
            {t(
              typeof state.error === 'object' &&
                state.error !== null &&
                Reflect.get(state.error, 'status') === 403
                ? 'home.noAccess'
                : 'home.loadFailed',
            )}
            <Button
              className='ml-3'
              size='sm'
              variant='outline'
              onClick={() => setRevision((value) => value + 1)}
            >
              {t('tickets.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  const metrics = [
    {
      key: 'active',
      label: t('home.metrics.active'),
      value: dashboard.counts.active,
      hint: t('home.metrics.activeHint'),
      icon: LifeBuoyIcon,
    },
    {
      key: 'awaiting',
      label: t('home.metrics.awaiting'),
      value: dashboard.counts.resolved,
      hint: t('home.metrics.awaitingHint'),
      icon: ClockIcon,
    },
    {
      key: 'overdue',
      label: t('home.metrics.overdue'),
      value: dashboard.counts.overdue,
      hint: t('home.metrics.overdueHint'),
      icon: TriangleAlertIcon,
    },
    {
      key: 'unassigned',
      label: t('home.metrics.unassigned'),
      value: dashboard.counts.unassigned,
      hint: t('home.metrics.unassignedHint'),
      icon: UsersIcon,
    },
  ] as const;

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('home.title')}
        description={
          serviceDesk ? t('home.descriptionDesk') : t('home.descriptionMine')
        }
        actions={
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              variant='outline'
              nativeButton={false}
              render={<Link to='/tickets' />}
            >
              {t('home.allTickets')}
              <ArrowRightIcon />
            </Button>
            <Button nativeButton={false} render={<Link to='/tickets/new' />}>
              <CirclePlusIcon />
              {t('tickets.new')}
            </Button>
          </div>
        }
      />

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.key}>
              <CardHeader className='flex flex-row items-start justify-between gap-3'>
                <div className='flex flex-col gap-1'>
                  <CardDescription>{metric.label}</CardDescription>
                  <span className='font-heading text-3xl font-semibold tabular-nums'>
                    {metric.value}
                  </span>
                </div>
                <span className='flex size-9 items-center justify-center rounded-lg bg-primary/5 text-primary'>
                  <Icon className='size-4' aria-hidden />
                </span>
              </CardHeader>
              <CardContent className='text-xs text-muted-foreground'>
                {metric.hint}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {serviceDesk ? (
        <>
          <div className='grid gap-4 lg:grid-cols-2'>
            <TicketQueue
              title={t('home.unassigned.title')}
              description={t('home.unassigned.description')}
              tickets={dashboard.unassigned}
              empty={t('home.unassigned.empty')}
            />
            <TicketQueue
              title={t('home.overdue.title')}
              description={t('home.overdue.description')}
              tickets={dashboard.overdue}
              empty={t('home.overdue.empty')}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t('home.workload.title')}</CardTitle>
              <CardDescription>
                {t('home.workload.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dashboard.workload.length === 0 ? (
                <p className='rounded-lg border border-dashed p-4 text-sm text-muted-foreground'>
                  {t('home.workload.empty')}
                </p>
              ) : (
                <ul className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
                  {dashboard.workload.map((entry) => (
                    <li
                      key={entry.user.id}
                      className='flex items-center justify-between gap-3 rounded-lg border p-3'
                    >
                      <span className='flex min-w-0 flex-col'>
                        <span className='truncate text-sm font-medium'>
                          {entry.user.name || entry.user.email}
                        </span>
                        <span className='text-xs text-muted-foreground'>
                          {t('home.workload.activeCount', {
                            count: entry.active,
                          })}
                        </span>
                      </span>
                      {entry.overdue > 0 ? (
                        <span className='flex items-center gap-1 text-xs font-medium text-warning'>
                          <TriangleAlertIcon className='size-3.5' aria-hidden />
                          {t('home.workload.overdueCount', {
                            count: entry.overdue,
                          })}
                        </span>
                      ) : (
                        <span className='text-xs text-muted-foreground'>
                          {t('home.workload.onTrack')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <div className='grid gap-4 lg:grid-cols-2'>
          <TicketQueue
            title={t('home.myOpen.title')}
            description={t('home.myOpen.description')}
            tickets={dashboard.recent.filter(
              (ticket) =>
                ticket.status === 'open' || ticket.status === 'in_progress',
            )}
            empty={t('home.myOpen.empty')}
          />
          <TicketQueue
            title={t('home.awaiting.title')}
            description={t('home.awaiting.description')}
            tickets={dashboard.awaitingConfirmation}
            empty={t('home.awaiting.empty')}
          />
        </div>
      )}

      <TicketQueue
        title={t('home.recent.title')}
        description={t('home.recent.description')}
        tickets={dashboard.recent}
        empty={t('home.recent.empty')}
      />

      <p className='-mt-2 flex items-center gap-2 text-xs text-muted-foreground'>
        <InboxIcon className='size-3.5' aria-hidden />
        {t('home.notificationsHint')}
      </p>
    </PageContainer>
  );
}
