import { ApiClientError } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, PlusIcon, RefreshCwIcon } from 'lucide-react';
import { type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

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
  Card,
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
import { Spinner } from '#components/ui/spinner';
import { useTicketDashboard, type Ticket } from '#hooks/itsm';

/** The work each role sees first, on the page every signed-in user lands on. */
export default function DashboardPage(): ReactElement {
  const { t } = useTranslation();
  const dashboard = useTicketDashboard();

  return (
    <PageContainer>
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        actions={
          <Button
            type='button'
            variant='outline'
            onClick={() => void dashboard.refetch()}
            disabled={dashboard.isFetching}
          >
            {dashboard.isFetching ? (
              <Spinner data-icon='inline-start' />
            ) : (
              <RefreshCwIcon data-icon='inline-start' />
            )}
            {t('actions.refresh')}
          </Button>
        }
      />

      {dashboard.isError ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertTitle>{t('dashboard.error.title')}</AlertTitle>
          <AlertDescription>
            {errorMessage(dashboard.error, t)}
          </AlertDescription>
          <AlertAction>
            <Button
              type='button'
              size='sm'
              variant='secondary'
              onClick={() => void dashboard.refetch()}
            >
              {t('actions.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : dashboard.data ? (
        <DashboardBody
          data={dashboard.data}
          refreshing={dashboard.isFetching}
        />
      ) : (
        <DashboardSkeleton />
      )}
      <Outlet />
    </PageContainer>
  );
}

function DashboardBody({
  data,
  refreshing,
}: {
  readonly data: NonNullable<ReturnType<typeof useTicketDashboard>['data']>;
  readonly refreshing: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='space-y-6'>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        <MetricCard
          title={t('dashboard.metrics.pending.title')}
          value={data.pendingAssignment.length}
          description={t('dashboard.metrics.pending.description')}
          to='/tickets?status=pending'
        />
        <MetricCard
          title={t('dashboard.metrics.overdue.title')}
          value={data.overdue.length}
          description={t('dashboard.metrics.overdue.description')}
          to='/tickets'
        />
        <MetricCard
          title={t('dashboard.metrics.role.title')}
          value={t(`dashboard.roles.${data.role}`)}
          description={t('dashboard.metrics.role.description')}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.workload.title')}</CardTitle>
          <CardDescription>
            {t('dashboard.workload.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.workloads.length === 0 ? (
            <Empty className='border-none'>
              <EmptyHeader>
                <EmptyTitle>{t('dashboard.workload.empty')}</EmptyTitle>
                <EmptyDescription>
                  {t('dashboard.workload.emptyDescription')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className='divide-y'>
              {data.workloads.map((workload) => (
                <li
                  key={workload.engineerId}
                  className='flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0'
                >
                  <span className='font-medium'>{workload.engineerName}</span>
                  <span className='flex items-center gap-4 text-sm text-muted-foreground'>
                    <span>
                      {t('dashboard.workload.active', {
                        count: workload.active,
                      })}
                    </span>
                    <span>
                      {t('dashboard.workload.resolved', {
                        count: workload.resolved,
                      })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className='grid gap-6 lg:grid-cols-2'>
        <TicketGroup
          title={t('dashboard.pending.title')}
          description={t('dashboard.pending.description')}
          tickets={data.pendingAssignment}
          emptyTitle={t('dashboard.pending.empty')}
          emptyDescription={t('dashboard.pending.emptyDescription')}
          viewAllTo='/tickets?status=pending'
          viewAllLabel={t('dashboard.pending.viewAll')}
          refreshing={refreshing}
        />
        <TicketGroup
          title={t('dashboard.overdue.title')}
          description={t('dashboard.overdue.description')}
          tickets={data.overdue}
          emptyTitle={t('dashboard.overdue.empty')}
          emptyDescription={t('dashboard.overdue.emptyDescription')}
          viewAllTo='/tickets'
          viewAllLabel={t('dashboard.overdue.viewAll')}
          refreshing={refreshing}
        />
      </div>

      <div className='flex justify-end'>
        <Button render={<Link to='/tickets/new' />}>
          <PlusIcon data-icon='inline-start' />
          {t('tickets.create.action')}
        </Button>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  to,
}: {
  readonly title: string;
  readonly value: number | string;
  readonly description: string;
  readonly to?: string;
}): ReactElement {
  const content = (
    <Card className={to ? 'transition-colors hover:bg-muted/40' : undefined}>
      <CardHeader>
        <CardTitle className='text-sm font-medium text-muted-foreground'>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className='text-3xl font-semibold tracking-tight'>{value}</p>
        <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
      </CardContent>
    </Card>
  );
  return to ? (
    <Link to={to} className='block rounded-xl focus-visible:outline-none'>
      {content}
    </Link>
  ) : (
    content
  );
}

function TicketGroup({
  title,
  description,
  tickets,
  emptyTitle,
  emptyDescription,
  viewAllTo,
  viewAllLabel,
  refreshing,
}: {
  readonly title: string;
  readonly description: string;
  readonly tickets: readonly Ticket[];
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly viewAllTo: string;
  readonly viewAllLabel: string;
  readonly refreshing: boolean;
}): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-2'>
        {refreshing && tickets.length === 0 ? (
          <Skeleton className='h-24 w-full' />
        ) : tickets.length === 0 ? (
          <Empty className='border-none'>
            <EmptyHeader>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
              <EmptyDescription>{emptyDescription}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className='divide-y'>
            {tickets.map((ticket) => (
              <li key={ticket.id} className='py-2 first:pt-0 last:pb-0'>
                <Link
                  to={`ticket/${ticket.id}`}
                  className='flex flex-col gap-1 rounded-md p-1 hover:bg-muted/50'
                >
                  <span className='font-medium'>{ticket.title}</span>
                  <span className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                    <TicketStatusBadge status={ticket.status} />
                    <TicketUrgencyBadge urgency={ticket.urgency} />
                    {ticket.overdue ? <TicketOverdueBadge /> : null}
                    <span>{ticket.requesterName ?? ticket.requesterId}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className='pt-2'>
          <Button
            variant='link'
            size='sm'
            className='px-0'
            render={<Link to={viewAllTo} />}
          >
            {viewAllLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton(): ReactElement {
  return (
    <div className='space-y-6' aria-busy='true'>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className='h-32 w-full' />
        ))}
      </div>
      <Skeleton className='h-48 w-full' />
      <div className='grid gap-6 lg:grid-cols-2'>
        <Skeleton className='h-64 w-full' />
        <Skeleton className='h-64 w-full' />
      </div>
    </div>
  );
}

function errorMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof ApiClientError) {
    return `${t('dashboard.error.description')} (${error.status})`;
  }
  return t('dashboard.error.description');
}
