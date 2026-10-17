import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  InboxIcon,
  PlusIcon,
  TicketIcon,
  UserPlusIcon,
  UsersRoundIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';

import type {
  DashboardResult,
  TicketPriority,
  TicketSummary,
} from '../tickets/types.js';
import { formatDate, requestErrorMessage } from '../tickets/ticket-format.js';
import {
  OverdueBadge,
  PriorityBadge,
  TicketStatusBadge,
} from '../tickets/ticket-ui.js';

const PRIORITIES: readonly TicketPriority[] = [
  'urgent',
  'high',
  'normal',
  'low',
];

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [result, setResult] = useState<{
    readonly data?: DashboardResult;
    readonly denied?: boolean;
    readonly error?: string;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    api
      .request<{ data: DashboardResult }>({
        path: 'service-desk/dashboard',
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!controller.signal.aborted) setResult({ data });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiClientError && cause.status === 403) {
          setResult({ denied: true });
          return;
        }
        setResult({ error: requestErrorMessage(cause, t) });
      });
    return () => controller.abort();
  }, [api, t]);

  const loading = !result;
  const { data, denied, error } = result ?? {};

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={t('serviceDesk.dashboard.title', {
          defaultValue: 'Service desk',
        })}
        description={t('serviceDesk.dashboard.description', {
          defaultValue:
            'See what needs attention, what is in progress, and how quickly requests are resolved.',
        })}
        actions={
          data?.canCreate ? (
            <Button render={<Link to='/tickets/new' />}>
              <PlusIcon data-icon='inline-start' />
              {t('serviceDesk.ticket.new', { defaultValue: 'New ticket' })}
            </Button>
          ) : null
        }
      />

      {loading && !data ? (
        <Loading className='py-24' />
      ) : denied ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>
              {t('serviceDesk.dashboard.deniedTitle', {
                defaultValue: 'Service desk is not available',
              })}
            </EmptyTitle>
            <EmptyDescription>
              {t('serviceDesk.dashboard.deniedDescription', {
                defaultValue:
                  'Your account does not have permission to use the service desk.',
              })}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : error ? (
        <p className='rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive'>
          {error}
        </p>
      ) : data ? (
        <div className='flex flex-col gap-6'>
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            <SummaryCard
              icon={<TicketIcon className='size-4' />}
              label={t('serviceDesk.dashboard.total', {
                defaultValue: 'Total tickets',
              })}
              value={data.total}
              hint={t('serviceDesk.dashboard.allTime', {
                defaultValue: 'All requests',
              })}
            />
            <SummaryCard
              icon={<CircleDotIcon className='size-4' />}
              label={t('serviceDesk.dashboard.active', {
                defaultValue: 'Active',
              })}
              value={data.open + data.assigned}
              hint={t('serviceDesk.dashboard.activeHint', {
                defaultValue: '{{open}} open · {{assigned}} in progress',
                open: data.open,
                assigned: data.assigned,
              })}
            />
            {data.canAssign ? (
              <SummaryCard
                icon={<UserPlusIcon className='size-4' />}
                label={t('serviceDesk.dashboard.unassigned', {
                  defaultValue: 'Awaiting assignment',
                })}
                value={data.unassigned}
                hint={t('serviceDesk.dashboard.unassignedHint', {
                  defaultValue: 'No engineer assigned yet',
                })}
                tone={data.unassigned > 0 ? 'warning' : 'neutral'}
              />
            ) : null}
            <SummaryCard
              icon={<CheckCircle2Icon className='size-4' />}
              label={t('serviceDesk.dashboard.resolutionRate', {
                defaultValue: 'Resolution rate',
              })}
              value={`${Math.round(data.resolutionRate)}%`}
              hint={t('serviceDesk.dashboard.resolvedHint', {
                defaultValue: '{{count}} resolved or closed',
                count: data.resolved + data.closed,
              })}
            />
            <SummaryCard
              icon={<AlertTriangleIcon className='size-4' />}
              label={t('serviceDesk.dashboard.overdue', {
                defaultValue: 'Overdue',
              })}
              value={data.overdue}
              hint={t('serviceDesk.dashboard.overdueHint', {
                defaultValue: 'Past the SLA target',
              })}
              tone={data.overdue > 0 ? 'warning' : 'neutral'}
            />
          </div>

          <div className='grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]'>
            <Card>
              <CardHeader className='flex-row items-center justify-between gap-3'>
                <div className='flex flex-col gap-1'>
                  <CardTitle>
                    {t('serviceDesk.dashboard.recent', {
                      defaultValue: 'Recent tickets',
                    })}
                  </CardTitle>
                  <CardDescription>
                    {t('serviceDesk.dashboard.recentDescription', {
                      defaultValue: 'The latest requests from your team.',
                    })}
                  </CardDescription>
                </div>
                <Button
                  variant='ghost'
                  size='sm'
                  render={<Link to='/tickets' />}
                >
                  {t('serviceDesk.actions.viewAll', {
                    defaultValue: 'View all',
                  })}
                </Button>
              </CardHeader>
              <CardContent>
                {data.recent.length === 0 ? (
                  <p className='py-8 text-center text-sm text-muted-foreground'>
                    {t('serviceDesk.dashboard.noRecent', {
                      defaultValue: 'No tickets yet.',
                    })}
                  </p>
                ) : (
                  <ul className='flex flex-col divide-y divide-border'>
                    {data.recent.map((ticket) => (
                      <li key={ticket.id}>
                        <RecentTicket ticket={ticket} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  {t('serviceDesk.dashboard.byPriority', {
                    defaultValue: 'By priority',
                  })}
                </CardTitle>
                <CardDescription>
                  {t('serviceDesk.dashboard.byPriorityDescription', {
                    defaultValue: 'Where the current workload sits.',
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PriorityBreakdown data={data} />
                <dl className='mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm'>
                  <div>
                    <dt className='text-xs text-muted-foreground'>
                      {t('serviceDesk.status.open', { defaultValue: 'Open' })}
                    </dt>
                    <dd className='mt-0.5 text-lg font-medium tabular-nums'>
                      {data.open}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs text-muted-foreground'>
                      {t('serviceDesk.status.assigned', {
                        defaultValue: 'Assigned',
                      })}
                    </dt>
                    <dd className='mt-0.5 text-lg font-medium tabular-nums'>
                      {data.assigned}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs text-muted-foreground'>
                      {t('serviceDesk.status.resolved', {
                        defaultValue: 'Resolved',
                      })}
                    </dt>
                    <dd className='mt-0.5 text-lg font-medium tabular-nums'>
                      {data.resolved}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-xs text-muted-foreground'>
                      {t('serviceDesk.status.closed', {
                        defaultValue: 'Closed',
                      })}
                    </dt>
                    <dd className='mt-0.5 text-lg font-medium tabular-nums'>
                      {data.closed}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>

          {data.canAssign ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  {t('serviceDesk.dashboard.workload', {
                    defaultValue: 'Engineer workload',
                  })}
                </CardTitle>
                <CardDescription>
                  {t('serviceDesk.dashboard.workloadDescription', {
                    defaultValue: 'Active tickets assigned to each engineer.',
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.workload.length === 0 ? (
                  <p className='py-4 text-sm text-muted-foreground'>
                    {t('serviceDesk.dashboard.workloadEmpty', {
                      defaultValue:
                        'No service desk engineer has been granted the role yet.',
                    })}
                  </p>
                ) : (
                  <ul className='flex flex-col divide-y divide-border'>
                    {data.workload.map((engineer) => (
                      <li
                        key={engineer.id}
                        className='flex flex-wrap items-center justify-between gap-2 py-3'
                      >
                        <div className='flex min-w-0 items-center gap-2'>
                          <UsersRoundIcon className='size-4 shrink-0 text-muted-foreground' />
                          <div className='min-w-0'>
                            <p className='truncate text-sm font-medium'>
                              {engineer.name}
                            </p>
                            <p className='truncate text-xs text-muted-foreground'>
                              {engineer.email}
                            </p>
                          </div>
                        </div>
                        <div className='flex shrink-0 items-center gap-2'>
                          {engineer.overdue > 0 ? (
                            <StatusBadge tone='warning'>
                              {t('serviceDesk.dashboard.engineerOverdue', {
                                count: engineer.overdue,
                                defaultValue: '{{count}} overdue',
                              })}
                            </StatusBadge>
                          ) : null}
                          <StatusBadge
                            tone={engineer.active > 0 ? 'info' : 'neutral'}
                          >
                            {t('serviceDesk.dashboard.engineerActive', {
                              count: engineer.active,
                              defaultValue: '{{count}} active',
                            })}
                          </StatusBadge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </PageContainer>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  readonly icon: ReactElement;
  readonly label: string;
  readonly value: string | number;
  readonly hint: string;
  readonly tone?: 'neutral' | 'warning';
}): ReactElement {
  return (
    <div className='flex flex-col gap-3 rounded-xl border border-border bg-card p-4'>
      <div className='flex items-center gap-2 text-sm text-muted-foreground'>
        <span
          className={
            tone === 'warning' ? 'text-(--status-warning)' : 'text-primary'
          }
        >
          {icon}
        </span>
        {label}
      </div>
      <div className='font-heading text-3xl font-semibold tracking-[-0.035em] tabular-nums'>
        {value}
      </div>
      <p className='text-xs text-muted-foreground'>{hint}</p>
    </div>
  );
}

function RecentTicket({
  ticket,
}: {
  readonly ticket: TicketSummary;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Link
      to={`/tickets/${ticket.id}`}
      className='flex flex-col gap-2 py-3 transition-colors hover:bg-muted/20'
    >
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-xs text-muted-foreground tabular-nums'>
          #{ticket.id}
        </span>
        <TicketStatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
        {ticket.overdue ? <OverdueBadge /> : null}
      </div>
      <span className='truncate text-sm font-medium'>{ticket.title}</span>
      <span className='text-xs text-muted-foreground'>
        {ticket.requesterName ??
          t('serviceDesk.ticket.unknownUser', {
            defaultValue: 'Unknown user',
          })}{' '}
        ·{' '}
        {t('serviceDesk.ticket.updatedAt', {
          date: formatDate(ticket.updatedAt),
          defaultValue: 'Updated {{date}}',
        })}
      </span>
    </Link>
  );
}

function PriorityBreakdown({
  data,
}: {
  readonly data: DashboardResult;
}): ReactElement {
  const { t } = useTranslation();
  const max = Math.max(1, ...PRIORITIES.map((item) => data.byPriority[item]));

  return (
    <ul className='flex flex-col gap-3'>
      {PRIORITIES.map((priority) => {
        const count = data.byPriority[priority];
        return (
          <li key={priority} className='flex items-center gap-3'>
            <span className='w-14 shrink-0 text-xs text-muted-foreground'>
              {t(`serviceDesk.priority.${priority}`)}
            </span>
            <span className='h-2 flex-1 overflow-hidden rounded-full bg-muted'>
              <span
                className={
                  priority === 'urgent' || priority === 'high'
                    ? 'block h-full rounded-full bg-(--status-warning)'
                    : 'block h-full rounded-full bg-primary/60'
                }
                style={{ width: `${(count / max) * 100}%` }}
              />
            </span>
            <span className='w-6 shrink-0 text-right text-sm tabular-nums'>
              {count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
