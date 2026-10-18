import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { ArrowRightIcon, RefreshCwIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router';

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
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#components/ui/empty';
import { Skeleton } from '#components/ui/skeleton';

import { fetchDashboard } from '../tickets/api.js';
import type { TicketsOutletContext } from '../tickets/context.js';
import { formatDateTime } from '../tickets/format.js';
import { TicketStatusBadge, TicketUrgencyBadge } from '../tickets/status.js';
import type { ServiceDeskDashboard, Ticket } from '../tickets/types.js';

/** A dashboard list shows a few rows; the full list is one click away. */
const LIST_LIMIT = 10;

/**
 * The service desk home page: the numbers the desk watches, each engineer's open workload, and the tickets waiting
 * to be assigned or already overdue. It is the application's landing page, so a signed-in user reaches the overview
 * first. A ticket opened here stays over the home page, so the drawer is declared as a child route and this page
 * provides the outlet context it reloads through.
 */
export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = String(reloadToken);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly data?: ServiceDeskDashboard;
    readonly error?: unknown;
  }>();

  useEffect(() => {
    const key = requestKey;
    fetchDashboard(api).then(
      (data) => setResult({ key, data }),
      (error: unknown) => setResult({ key, error }),
    );
  }, [api, requestKey]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const data = loading ? undefined : result?.data;

  const refresh = useCallback(
    () => setReloadToken((token) => token + 1),
    [setReloadToken],
  );
  const outletContext = useMemo<TicketsOutletContext>(
    () => ({ reload: refresh }),
    [refresh],
  );
  const ticketHref = useCallback(
    (ticket: Ticket) => ({
      pathname: `/${ticket.id}`,
      search: location.search,
    }),
    [location.search],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        actions={
          <Button
            variant='outline'
            size='icon'
            aria-label={t('actions.refresh')}
            onClick={refresh}
          >
            <RefreshCwIcon className={loading ? 'animate-spin' : undefined} />
          </Button>
        }
      />

      {loading ? <DashboardSkeleton /> : null}

      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('dashboard.error.title')}</AlertTitle>
          <AlertDescription>
            {error instanceof ApiClientError && error.status === 403
              ? t('dashboard.error.forbidden')
              : t('dashboard.error.description')}
          </AlertDescription>
          {error instanceof ApiClientError && error.status === 403 ? null : (
            <AlertAction>
              <Button variant='outline' size='sm' onClick={refresh}>
                {t('actions.retry')}
              </Button>
            </AlertAction>
          )}
        </Alert>
      ) : null}

      {data ? (
        <DashboardContent data={data} openTicketHref={ticketHref} />
      ) : null}

      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function DashboardContent({
  data,
  openTicketHref,
}: {
  readonly data: ServiceDeskDashboard;
  readonly openTicketHref: (ticket: Ticket) => {
    readonly pathname: string;
    readonly search: string;
  };
}): ReactElement {
  const { t } = useTranslation();

  const metrics = [
    {
      key: 'pendingAssignment',
      label: t('dashboard.metric.pendingAssignment'),
      value: data.pendingAssignment,
    },
    {
      key: 'processing',
      label: t('dashboard.metric.processing'),
      value: data.processing,
    },
    {
      key: 'resolved',
      label: t('dashboard.metric.resolved'),
      value: data.resolved,
    },
    {
      key: 'overdue',
      label: t('dashboard.metric.overdue'),
      value: data.overdue,
    },
  ] as const;

  return (
    <>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {metrics.map((metric) => (
          <Card key={metric.key} size='sm'>
            <CardHeader>
              <CardDescription>{metric.label}</CardDescription>
              <CardTitle className='text-3xl tabular-nums'>
                {metric.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.workload.title')}</CardTitle>
          <CardDescription>
            {t('dashboard.workload.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.workload.length === 0 ? (
            <Empty className='min-h-40 p-6 md:p-6'>
              <EmptyHeader>
                <EmptyTitle>{t('dashboard.workload.empty')}</EmptyTitle>
                <EmptyDescription>
                  {t('dashboard.workload.emptyHint')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className='flex flex-col divide-y'>
              {data.workload.map((engineer) => (
                <li
                  key={engineer.assigneeId}
                  className='flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0'
                >
                  <span className='min-w-0 truncate font-medium'>
                    {engineer.assigneeName}
                  </span>
                  <span className='shrink-0 text-muted-foreground'>
                    {t('dashboard.workload.openCount', {
                      count: engineer.openCount,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <TicketListCard
        title={t('dashboard.pending.title')}
        description={t('dashboard.pending.description')}
        emptyTitle={t('dashboard.pending.empty')}
        emptyHint={t('dashboard.pending.emptyHint')}
        tickets={data.pendingTickets}
        viewAllTo={{ pathname: '/tickets', search: '?status=pending' }}
        openTicketHref={openTicketHref}
      />

      <TicketListCard
        title={t('dashboard.overdue.title')}
        description={t('dashboard.overdue.description')}
        emptyTitle={t('dashboard.overdue.empty')}
        emptyHint={t('dashboard.overdue.emptyHint')}
        tickets={data.overdueTickets}
        viewAllTo={{ pathname: '/tickets', search: '?status=processing' }}
        openTicketHref={openTicketHref}
      />
    </>
  );
}

function TicketListCard({
  title,
  description,
  emptyTitle,
  emptyHint,
  tickets,
  viewAllTo,
  openTicketHref,
}: {
  readonly title: string;
  readonly description: string;
  readonly emptyTitle: string;
  readonly emptyHint: string;
  readonly tickets: readonly Ticket[];
  readonly viewAllTo: { readonly pathname: string; readonly search: string };
  readonly openTicketHref: (ticket: Ticket) => {
    readonly pathname: string;
    readonly search: string;
  };
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const visible = tickets.slice(0, LIST_LIMIT);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Button variant='ghost' size='sm' render={<Link to={viewAllTo} />}>
            {t('dashboard.viewAll')}
            <ArrowRightIcon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <Empty className='min-h-40 p-6 md:p-6'>
            <EmptyHeader>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
              <EmptyDescription>{emptyHint}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className='flex flex-col divide-y'>
            {visible.map((ticket) => (
              <li key={ticket.id} className='first:pt-0 last:pb-0'>
                <Link
                  to={openTicketHref(ticket)}
                  className='flex items-center gap-3 py-2 hover:text-primary'
                >
                  <span className='shrink-0 tabular-nums text-muted-foreground'>
                    #{ticket.id}
                  </span>
                  <span className='min-w-0 flex-1 truncate font-medium'>
                    {ticket.title}
                  </span>
                  <span className='hidden shrink-0 text-muted-foreground sm:inline'>
                    {formatDateTime(ticket.createdAt, locale)}
                  </span>
                  <TicketUrgencyBadge urgency={ticket.urgency} />
                  <TicketStatusBadge status={ticket.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton(): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      role='status'
      aria-label={t('dashboard.loading')}
      className='flex flex-col gap-6'
    >
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {['a', 'b', 'c', 'd'].map((key) => (
          <Skeleton key={key} className='h-24 w-full' />
        ))}
      </div>
      <Skeleton className='h-40 w-full' />
      <Skeleton className='h-56 w-full' />
    </div>
  );
}
