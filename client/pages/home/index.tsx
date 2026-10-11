import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  InboxIcon,
  LoaderIcon,
  PlusIcon,
  UserIcon,
  XCircleIcon,
} from 'lucide-react';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { DataTable } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { Skeleton } from '#components/ui/skeleton';

import { TicketUrgencyBadge } from '../tickets/status-badge.js';
import type {
  EngineerWorkload,
  ItDashboard,
  TicketList,
  Ticket,
} from '../tickets/types.js';

const SHORT_LIST_SIZE = 5;

export default function DashboardPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly dashboard?: ItDashboard;
    readonly open?: Ticket[];
    readonly error?: unknown;
  }>();
  const requestKey = String(reloadCount);

  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    Promise.all([
      api.request<{ data: ItDashboard }>({
        path: 'itDashboard',
        signal: controller.signal,
      }),
      api.request<TicketList>({
        path: 'itTickets',
        query: { status: 'open', pageSize: 100 },
        signal: controller.signal,
      }),
    ]).then(
      ([dashboardResponse, ticketsResponse]) => {
        if (!controller.signal.aborted) {
          setResult({
            key,
            dashboard: dashboardResponse.data,
            open: [...ticketsResponse.data],
          });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResult((previous) => ({ ...previous, key, error }));
        }
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const dashboard = result?.dashboard;
  const open = result?.open;

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );

  const pending = useMemo(
    () => (open ?? []).filter((ticket) => ticket.status === 'pending'),
    [open],
  );
  const overdue = useMemo(
    () => (open ?? []).filter((ticket) => ticket.overdue),
    [open],
  );

  const ticketColumns = useMemo<ColumnDef<Ticket>[]>(
    () => [
      {
        accessorKey: 'id',
        header: t('tickets.fields.number'),
        cell: ({ row }) => (
          <Link
            to={`/tickets/${row.original.id}`}
            className='font-medium whitespace-nowrap hover:underline'
          >
            #{row.original.id}
          </Link>
        ),
      },
      {
        accessorKey: 'title',
        header: t('tickets.fields.title'),
        cell: ({ row }) => (
          <Link
            to={`/tickets/${row.original.id}`}
            className='font-medium hover:underline'
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'urgency',
        header: t('tickets.fields.urgency'),
        cell: ({ row }) => (
          <TicketUrgencyBadge urgency={row.original.urgency} />
        ),
      },
      {
        id: 'assignee',
        accessorFn: (row) => row.assigneeName ?? '',
        header: t('tickets.fields.assignee'),
        cell: ({ row }) =>
          row.original.assigneeName ?? (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        accessorKey: 'updatedAt',
        header: t('tickets.fields.updatedAt'),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {dateFormat.format(new Date(row.original.updatedAt))}
          </span>
        ),
      },
    ],
    [dateFormat, t],
  );

  const workloadColumns = useMemo<ColumnDef<EngineerWorkload>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('dashboard.workload.engineer'),
        cell: ({ row }) => (
          <span className='font-medium'>{row.original.name}</span>
        ),
      },
      {
        id: 'role',
        accessorFn: (row) => row.role ?? '',
        header: t('dashboard.workload.role'),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {row.original.role ? t(`tickets.roles.${row.original.role}`) : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'open',
        header: t('dashboard.workload.open'),
        cell: ({ row }) => (
          <span className='tabular-nums'>{row.original.open}</span>
        ),
      },
      {
        accessorKey: 'total',
        header: t('dashboard.workload.total'),
        cell: ({ row }) => (
          <span className='tabular-nums'>{row.original.total}</span>
        ),
      },
    ],
    [t],
  );

  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = <SessionExpiredAlert />;
  } else if (error) {
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('dashboard.error.title')}</AlertTitle>
        <AlertDescription>
          {t('dashboard.error.requestFailed')}
        </AlertDescription>
        <AlertAction>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setReloadCount((count) => count + 1)}
          >
            {t('status.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  } else if (!dashboard || !open) {
    content = <DashboardSkeleton label={t('status.loading')} />;
  } else {
    content = (
      <>
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'>
          <MetricCard
            label={t('dashboard.metrics.pending')}
            value={dashboard.pending}
            icon={<InboxIcon />}
          />
          <MetricCard
            label={t('dashboard.metrics.processing')}
            value={dashboard.processing}
            icon={<LoaderIcon />}
          />
          <MetricCard
            label={t('dashboard.metrics.resolved')}
            value={dashboard.resolved}
            icon={<CheckCircle2Icon />}
          />
          <MetricCard
            label={t('dashboard.metrics.overdue')}
            value={dashboard.overdue}
            icon={<ClockIcon />}
            tone='warning'
          />
          <MetricCard
            label={t('dashboard.metrics.mine')}
            value={dashboard.mine}
            icon={<UserIcon />}
          />
          <MetricCard
            label={t('dashboard.metrics.closed')}
            value={dashboard.closed}
            icon={<XCircleIcon />}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.pending.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('dashboard.pending.empty')}
              </p>
            ) : (
              <DataTable
                columns={ticketColumns}
                data={pending}
                getRowId={(ticket) => String(ticket.id)}
                pagination={false}
                showSelectedCount={false}
                pageSize={SHORT_LIST_SIZE}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.overdue.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {overdue.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('dashboard.overdue.empty')}
              </p>
            ) : (
              <DataTable
                columns={ticketColumns}
                data={overdue}
                getRowId={(ticket) => String(ticket.id)}
                pagination={false}
                showSelectedCount={false}
                pageSize={SHORT_LIST_SIZE}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.workload.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.engineers.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('dashboard.workload.empty')}
              </p>
            ) : (
              <DataTable
                columns={workloadColumns}
                data={[...dashboard.engineers]}
                getRowId={(workload) => workload.userId}
                pagination={false}
                showSelectedCount={false}
              />
            )}
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
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

function MetricCard({
  label,
  value,
  icon,
  tone = 'default',
}: {
  readonly label: string;
  readonly value: number;
  readonly icon: ReactElement;
  readonly tone?: 'default' | 'warning';
}): ReactElement {
  return (
    <Card>
      <CardContent className='flex items-center justify-between gap-3 pt-6'>
        <div className='space-y-1'>
          <p className='text-sm text-muted-foreground'>{label}</p>
          <p className='text-2xl font-semibold tabular-nums'>{value}</p>
        </div>
        <span
          aria-hidden='true'
          className={
            tone === 'warning'
              ? 'text-(--status-warning) [&_svg]:size-5'
              : 'text-muted-foreground [&_svg]:size-5'
          }
        >
          {icon}
        </span>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton({
  label,
}: {
  readonly label: string;
}): ReactElement {
  return (
    <div role='status' aria-label={label} className='space-y-4'>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className='h-24' />
        ))}
      </div>
      <Skeleton className='h-56' />
      <Skeleton className='h-56' />
    </div>
  );
}
