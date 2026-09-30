import { useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  ClockIcon,
  CpuIcon,
  InboxIcon,
  PlayCircleIcon,
  ShieldCheckIcon,
  UsersIcon,
} from 'lucide-react';
import { type ReactElement, useMemo } from 'react';
import { Link } from 'react-router';

import { DataTable } from '@/components/data-table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { StatCard } from '../components/stat-card.js';
import { ScheduleCard } from '../components/schedule-card.js';
import {
  AcceptanceBadge,
  TicketPriorityBadge,
  TicketStatusBadge,
} from '../components/service-badges.js';
import {
  DateTimeText,
  EmptyState,
  LoadError,
  TableSkeleton,
} from '../components/service-states.js';
import { useAsync, useServiceApi } from '../service-hooks.js';
import type { ServiceTicket, TeamWorkload } from '../types.js';

/** The service landing page: workload, overdue work and the latest tickets. */
export default function ServiceDashboardPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const summary = useAsync(() => api.dashboard(), 'service-dashboard');

  const columns = useMemo<ColumnDef<ServiceTicket>[]>(
    () => [
      {
        accessorKey: 'code',
        header: t('service.ticket.code'),
        cell: ({ row }) => (
          <Link
            to={String(row.original.id)}
            className='font-medium text-primary underline-offset-4 hover:underline'
          >
            {row.original.code}
          </Link>
        ),
      },
      {
        accessorKey: 'title',
        header: t('service.ticket.title'),
        cell: ({ row }) => (
          <div className='flex min-w-0 flex-col'>
            <span className='truncate'>{row.original.title}</span>
            <span className='truncate text-xs text-muted-foreground'>
              {[row.original.customerName, row.original.deviceName]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: t('service.ticket.status'),
        cell: ({ row }) => (
          <div className='flex flex-wrap items-center gap-1'>
            <TicketStatusBadge value={row.original.status} />
            <AcceptanceBadge
              status={row.original.acceptanceStatus ?? null}
              error={row.original.acceptanceError ?? null}
            />
          </div>
        ),
      },
      {
        accessorKey: 'priority',
        header: t('service.ticket.priority'),
        cell: ({ row }) => (
          <TicketPriorityBadge value={row.original.priority} />
        ),
      },
      {
        accessorKey: 'dueAt',
        header: t('service.ticket.dueAt'),
        cell: ({ row }) => <DateTimeText value={row.original.dueAt} />,
      },
    ],
    [t],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.dashboard.title')}
        description={t('service.dashboard.description')}
        actions={
          <Button render={<Link to='tickets' />}>
            {t('service.dashboard.openTickets')}
          </Button>
        }
      />

      {summary.error ? (
        <LoadError error={summary.error} onRetry={summary.reload} />
      ) : null}

      {summary.loading ? (
        <TableSkeleton rows={3} columns={4} />
      ) : summary.data ? (
        <>
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            <StatCard
              label={t('service.dashboard.totalTickets')}
              value={summary.data.tickets.total}
              icon={<InboxIcon />}
              description={t('service.dashboard.openCount', {
                count: summary.data.tickets.total - summary.data.tickets.closed,
              })}
            />
            <StatCard
              label={t('service.dashboard.pendingAcceptance')}
              value={summary.data.tickets.pendingAcceptance}
              tone={
                summary.data.tickets.pendingAcceptance > 0
                  ? 'warning'
                  : 'default'
              }
              icon={<ClockIcon />}
            />
            <StatCard
              label={t('service.dashboard.processing')}
              value={summary.data.tickets.processing}
              tone='positive'
              icon={<PlayCircleIcon />}
              description={t('service.dashboard.pendingConfirmationCount', {
                count: summary.data.tickets.pendingConfirmation,
              })}
            />
            <StatCard
              label={t('service.dashboard.overdueTickets')}
              value={summary.data.tickets.overdue}
              tone={summary.data.tickets.overdue > 0 ? 'danger' : 'default'}
              icon={<AlertTriangleIcon />}
              description={t('service.dashboard.closedCount', {
                count: summary.data.tickets.closed,
              })}
            />
          </div>

          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            <StatCard
              label={t('service.dashboard.inspectionsScheduled')}
              value={summary.data.inspections.scheduled}
              icon={<ClipboardCheckIcon />}
              tone={
                summary.data.inspections.overdue > 0 ? 'warning' : 'default'
              }
              description={t('service.dashboard.inspectionsOverdueCount', {
                count: summary.data.inspections.overdue,
              })}
            />
            <StatCard
              label={t('service.dashboard.inspectionsCompleted')}
              value={summary.data.inspections.completed}
              icon={<CheckCircle2Icon />}
              tone='positive'
            />
            <StatCard
              label={t('service.dashboard.customers')}
              value={summary.data.customers}
              icon={<UsersIcon />}
            />
            <StatCard
              label={t('service.dashboard.devices')}
              value={summary.data.devices}
              icon={<CpuIcon />}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('service.dashboard.teams')}</CardTitle>
              <CardDescription>
                {t('service.dashboard.teamsDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              {(summary.data.teams ?? []).length === 0 ? (
                <EmptyState title={t('service.dashboard.noTeams')} />
              ) : (
                <div className='grid gap-4 md:grid-cols-2'>
                  {(summary.data.teams ?? []).map((team) => (
                    <TeamWorkloadCard key={team.id} team={team} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <ScheduleCard />

          <Card>
            <CardHeader>
              <CardTitle>{t('service.dashboard.recentTickets')}</CardTitle>
              <CardDescription>
                {t('service.dashboard.recentTicketsDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              {summary.data.recentTickets.length === 0 ? (
                <EmptyState title={t('service.dashboard.noTickets')} />
              ) : (
                <DataTable
                  columns={columns}
                  data={[...summary.data.recentTickets]}
                  pagination={false}
                />
              )}
              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  render={<Link to='tickets' />}
                >
                  <ShieldCheckIcon />
                  {t('service.nav.tickets')}
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  render={<Link to='inspections' />}
                >
                  <ClipboardCheckIcon />
                  {t('service.nav.inspections')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </PageContainer>
  );
}

/** One engineer group's workload, with each member's own open/total split. */
function TeamWorkloadCard({
  team,
}: {
  readonly team: TeamWorkload;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col gap-3 rounded-xl border bg-muted/20 p-4'>
      <div className='flex items-start justify-between gap-2'>
        <div className='min-w-0'>
          <p className='truncate text-sm font-medium'>
            {team.code} · {team.name}
          </p>
          <p className='text-xs text-muted-foreground'>
            {t('service.dashboard.engineerWorkload', {
              open: team.open,
              total: team.total,
            })}
          </p>
        </div>
        <Badge variant='outline'>
          {t('service.dashboard.memberCount', { count: team.members.length })}
        </Badge>
      </div>
      {team.members.length === 0 ? (
        <p className='text-xs text-muted-foreground'>
          {t('service.dashboard.noMembers')}
        </p>
      ) : (
        <ul className='flex flex-col divide-y divide-border/60'>
          {team.members.map((member) => (
            <li
              key={member.id}
              className='flex items-center justify-between gap-2 py-1.5 text-sm'
            >
              <span className='truncate'>{member.name}</span>
              <span className='shrink-0 text-xs text-muted-foreground'>
                {t('service.dashboard.engineerWorkload', {
                  open: member.open,
                  total: member.total,
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
