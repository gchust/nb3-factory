import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangleIcon,
  ClipboardListIcon,
  Loader2Icon,
  UsersIcon,
  WrenchIcon,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';

import { StatusBadge } from '#components/status-badge';
import { Skeleton } from '#components/ui/skeleton';

import {
  useTicketRequest,
  type DataBody,
  type TicketDashboard,
} from './api.js';
import { useTicketDashboardPermission, useTicketLabels } from './hooks.js';
import { TicketStatusBadge } from './shared.js';

/**
 * The service desk's numbers, drawn from `/api/tickets/dashboard`.
 *
 * The endpoint answers counts and per-engineer workload for the whole desk, so it is only fetched when the permission
 * snapshot says the caller holds the `dashboard` action. Employees and engineers never see it, and never issue a
 * request that would be refused.
 */
export function ServiceDeskOverview({
  className,
}: {
  readonly className?: string;
}): ReactElement | null {
  const { can, isPending } = useTicketDashboardPermission();
  if (isPending) return null;
  if (!can) return null;
  return <ServiceDeskOverviewContent className={className} />;
}

function ServiceDeskOverviewContent({
  className,
}: {
  readonly className?: string;
}): ReactElement | null {
  const request =
    useTicketRequest<DataBody<TicketDashboard>>('tickets/dashboard');
  if (request.error) return null;
  if (!request.data) {
    return (
      <div className={className}>
        <Skeleton className='h-28 w-full' />
      </div>
    );
  }
  return <DashboardCards dashboard={request.data.data} className={className} />;
}

/**
 * The numbers themselves: pending assignment, overdue, in progress, waiting for confirmation, and the workload each
 * engineer carries. Overdue is the one number that asks for action, so it is the one that is coloured.
 */
export function DashboardCards({
  dashboard,
  className,
}: {
  readonly dashboard: TicketDashboard;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className={className}>
      <ul className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        <Metric
          icon={<ClipboardListIcon />}
          label={t('tickets.dashboard.pendingAssignment')}
          value={dashboard.pendingAssignment}
          hint={t('tickets.dashboard.pendingAssignmentHint')}
          to={{ pathname: '/tickets', search: '?status=submitted' }}
        />
        <Metric
          icon={<AlertTriangleIcon />}
          tone='warning'
          label={t('tickets.dashboard.overdue', {
            hours: dashboard.overdueHours,
          })}
          value={dashboard.overdue}
          hint={t('tickets.dashboard.overdueHint')}
          to={{ pathname: '/tickets', search: '?overdue=1' }}
        />
        <Metric
          icon={<WrenchIcon />}
          label={t('tickets.dashboard.inProgress')}
          value={dashboard.inProgress}
          hint={t('tickets.dashboard.inProgressHint')}
          to={{ pathname: '/tickets', search: '?status=inProgress' }}
        />
        <Metric
          icon={<Loader2Icon />}
          label={t('tickets.dashboard.waitingConfirmation')}
          value={dashboard.waitingConfirmation}
          hint={t('tickets.dashboard.waitingConfirmationHint')}
          to={{ pathname: '/tickets', search: '?status=resolved' }}
        />
      </ul>
      <Workload rows={dashboard.workload} className='mt-3' />
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
  tone = 'neutral',
  to,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: number;
  readonly hint: string;
  readonly tone?: 'neutral' | 'warning';
  readonly to: { pathname: string; search: string };
}): ReactElement {
  return (
    <li>
      <Link
        to={to}
        className='flex h-full flex-col gap-1 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring'
      >
        <span className='flex items-center gap-2 text-sm text-muted-foreground'>
          <span
            className={
              tone === 'warning' ? 'text-(--status-warning)' : 'text-primary'
            }
            aria-hidden
          >
            {icon}
          </span>
          {label}
        </span>
        <span
          className={
            tone === 'warning'
              ? 'font-heading text-2xl font-semibold text-(--status-warning)'
              : 'font-heading text-2xl font-semibold'
          }
        >
          {value}
        </span>
        <span className='text-xs text-muted-foreground'>{hint}</span>
      </Link>
    </li>
  );
}

/** How much each engineer currently holds: being handled, and resolved but not yet confirmed. */
function Workload({
  rows,
  className,
}: {
  readonly rows: readonly TicketDashboard['workload'][number][];
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  const busiest = rows.reduce((most, row) => Math.max(most, row.active), 0);
  return (
    <div className={className}>
      <div className='flex items-center gap-2 pb-2 text-sm font-medium'>
        <UsersIcon className='size-4 text-muted-foreground' aria-hidden />
        {t('tickets.dashboard.workload')}
      </div>
      {rows.length ? (
        <ul className='grid gap-2 sm:grid-cols-2 xl:grid-cols-3'>
          {rows.map((row) => (
            <li
              key={row.assigneeId}
              className='flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2'
            >
              <span className='min-w-0 truncate text-sm'>
                {row.assigneeName}
              </span>
              <span className='flex shrink-0 items-center gap-2'>
                <StatusBadge
                  tone={
                    row.active >= busiest && busiest > 2 ? 'warning' : 'info'
                  }
                  size='sm'
                >
                  {t('tickets.dashboard.workloadActive', { count: row.active })}
                </StatusBadge>
                {row.waiting > 0 && (
                  <StatusBadge tone='neutral' size='sm'>
                    {t('tickets.dashboard.workloadWaiting', {
                      count: row.waiting,
                    })}
                  </StatusBadge>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-sm text-muted-foreground'>
          {t('tickets.dashboard.noWorkload')}
        </p>
      )}
    </div>
  );
}

/** The service desk's own queue, as the homepage shows it: what is late, and who is carrying what. */
export function ServiceDeskHomeSection(): ReactElement | null {
  const { can } = useTicketDashboardPermission();
  // The permission check comes first and the request lives in a child, so a caller who may not read the numbers never
  // mounts the fetch at all. The page also renders outside an application root in a component test, where mounting a
  // request would be the only thing that reaches for a service container.
  if (!can) return null;
  return <ServiceDeskHomeContent />;
}

function ServiceDeskHomeContent(): ReactElement | null {
  const { t } = useTranslation();
  const labels = useTicketLabels();
  const request =
    useTicketRequest<DataBody<TicketDashboard>>('tickets/dashboard');
  if (request.error || !request.data) return null;
  const dashboard = request.data.data;
  const overdue = dashboard.recent.filter(
    (ticket) => ticket.status !== 'closed' && ticket.status !== 'resolved',
  );
  return (
    <section className='flex flex-col gap-3'>
      <div className='flex flex-col gap-1'>
        <h2 className='text-base font-medium'>
          {t('tickets.dashboard.title')}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {t('tickets.dashboard.description')}
        </p>
      </div>
      <DashboardCards dashboard={dashboard} />
      {overdue.length > 0 && (
        <ul className='flex flex-col gap-2'>
          {overdue.slice(0, 5).map((ticket) => (
            <li key={ticket.id}>
              <Link
                to={`/tickets/${ticket.id}`}
                className='flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring'
              >
                <span className='min-w-0'>
                  <span className='block truncate text-sm font-medium'>
                    {ticket.title}
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    {labels.date(ticket.createdAt)}
                  </span>
                </span>
                <TicketStatusBadge status={ticket.status} size='sm' />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
