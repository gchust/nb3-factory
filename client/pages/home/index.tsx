import { useTranslation } from '@nocobase/i18n/client';
import {
  AlarmClockIcon,
  CircleCheckIcon,
  InboxIcon,
  ListTodoIcon,
  PlusIcon,
  SearchIcon,
  UsersIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RequestFailed } from '#components/request-failed';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { Empty, EmptyDescription, EmptyTitle } from '#components/ui/empty';
import {
  useServiceDeskOverview,
  type ServiceDeskOverview,
  type TicketState,
} from '#hooks/service-desk';

import { TicketStateBadge } from '../tickets/shared.js';

const SUMMARY_STATES: readonly TicketState[] = [
  'submitted',
  'assigned',
  'processing',
  'resolved',
];

/**
 * The landing page: what is waiting for the person looking at it, what is waiting for the whole service desk, and
 * how the engineers are loaded. It links to the ticket list rather than opening a record, so there is one page that
 * opens tickets and the list keeps its filters.
 */
export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const overview = useServiceDeskOverview();

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('serviceDesk.home.title')}
        description={t('serviceDesk.home.description')}
        actions={
          <Button nativeButton={false} render={<Link to='/tickets/new' />}>
            <PlusIcon data-icon='inline-start' />
            {t('serviceDesk.tickets.new')}
          </Button>
        }
      />

      {overview.error ? (
        <RequestFailed
          error={overview.error}
          title={t('serviceDesk.home.error.title')}
          description={t('serviceDesk.home.error.requestFailed')}
          onRetry={overview.reload}
        />
      ) : !overview.data ? (
        <Loading />
      ) : (
        <Overview overview={overview.data} />
      )}
    </PageContainer>
  );
}

function Overview({
  overview,
}: {
  readonly overview: ServiceDeskOverview;
}): ReactElement {
  const { t } = useTranslation();
  const { me, counts, pendingAssignment, overdue, open, workload } = overview;

  return (
    <div className='flex flex-col gap-6'>
      <section
        aria-label={t('serviceDesk.home.summaryLabel')}
        className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
      >
        <SummaryCard
          icon={<InboxIcon aria-hidden />}
          label={t('serviceDesk.home.pendingAssignment')}
          value={pendingAssignment}
          to='/tickets?status=submitted'
          tone={pendingAssignment > 0 ? 'warning' : 'neutral'}
        />
        <SummaryCard
          icon={<AlarmClockIcon aria-hidden />}
          label={t('serviceDesk.home.overdue')}
          value={overdue}
          to='/tickets?overdue=true'
          tone={overdue > 0 ? 'warning' : 'neutral'}
        />
        <SummaryCard
          icon={<ListTodoIcon aria-hidden />}
          label={t('serviceDesk.home.open')}
          value={open}
          to='/tickets'
        />
        <SummaryCard
          icon={<CircleCheckIcon aria-hidden />}
          label={t('serviceDesk.home.resolved')}
          value={counts.resolved}
          to='/tickets?status=resolved'
          tone='success'
        />
      </section>

      <div className='grid gap-6 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>{t('serviceDesk.home.byStatus')}</CardTitle>
            <CardDescription>
              {t('serviceDesk.home.byStatusDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-2'>
            {SUMMARY_STATES.map((state) => (
              <Link
                key={state}
                to={`/tickets?status=${state}`}
                className='flex items-center justify-between rounded-lg border border-transparent px-2 py-1.5 text-sm transition-colors hover:border-border hover:bg-muted/50'
              >
                <span className='flex items-center gap-2'>
                  <TicketStateBadge state={state} />
                </span>
                <span className='font-medium tabular-nums'>
                  {counts[state] ?? 0}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('serviceDesk.home.workload')}</CardTitle>
            <CardDescription>
              {me.helpdesk
                ? t('serviceDesk.home.workloadDescription')
                : t('serviceDesk.home.workloadMineDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {workload.length === 0 ? (
              <Empty className='border-none'>
                <EmptyTitle>{t('serviceDesk.home.noWorkload')}</EmptyTitle>
                <EmptyDescription>
                  {t('serviceDesk.home.noWorkloadDescription')}
                </EmptyDescription>
              </Empty>
            ) : (
              <ul className='flex flex-col gap-2'>
                {workload.map((item) => (
                  <li
                    key={item.engineerId}
                    className='flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2'
                  >
                    <span className='flex min-w-0 items-center gap-2'>
                      <UsersIcon
                        className='size-4 shrink-0 text-muted-foreground'
                        aria-hidden
                      />
                      <span className='truncate text-sm font-medium'>
                        {item.name}
                      </span>
                    </span>
                    <span className='flex shrink-0 items-center gap-2 text-sm text-muted-foreground'>
                      <span className='tabular-nums'>
                        {t('serviceDesk.home.workloadOpen', {
                          count: item.open,
                        })}
                      </span>
                      {item.overdue > 0 ? (
                        <StatusBadge tone='warning'>
                          {t('serviceDesk.home.workloadOverdue', {
                            count: item.overdue,
                          })}
                        </StatusBadge>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('serviceDesk.home.shortcuts')}</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-wrap gap-2'>
          <Button
            nativeButton={false}
            variant='outline'
            render={<Link to='/tickets' />}
          >
            <ListTodoIcon data-icon='inline-start' />
            {t('serviceDesk.home.allTickets')}
          </Button>
          <Button
            nativeButton={false}
            variant='outline'
            render={<Link to='/tickets?scope=mine' />}
          >
            <SearchIcon data-icon='inline-start' />
            {t('serviceDesk.home.myTickets')}
          </Button>
          {me.helpdesk ? (
            <Button
              nativeButton={false}
              variant='outline'
              render={<Link to='/settings/service-desk' />}
            >
              <UsersIcon data-icon='inline-start' />
              {t('serviceDesk.settings.title')}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  to,
  tone = 'neutral',
}: {
  readonly icon: ReactElement;
  readonly label: string;
  readonly value: number;
  readonly to: string;
  readonly tone?: 'neutral' | 'warning' | 'success';
}): ReactElement {
  return (
    <Link
      to={to}
      className='rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
    >
      <Card className='h-full transition-shadow hover:shadow-md motion-reduce:transition-none'>
        <CardHeader className='gap-2'>
          <CardDescription className='flex items-center gap-2'>
            <span className='text-muted-foreground'>{icon}</span>
            {label}
          </CardDescription>
          <CardTitle
            className={
              tone === 'warning' && value > 0
                ? 'text-2xl text-(--status-warning) tabular-nums'
                : 'text-2xl tabular-nums'
            }
          >
            {value}
          </CardTitle>
        </CardHeader>
      </Card>
    </Link>
  );
}
