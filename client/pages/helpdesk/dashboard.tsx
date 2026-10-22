import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowRightIcon,
  CircleAlertIcon,
  Clock3Icon,
  InboxIcon,
  LoaderCircleIcon,
  PlusIcon,
  ShieldCheckIcon,
  UsersIcon,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { useApiData } from './api.js';
import {
  CategoryLabel,
  HelpdeskEmpty,
  HelpdeskError,
  HelpdeskLoading,
  PriorityLabel,
  StatusLabel,
  TicketLink,
} from './shared.js';
import { formatDateTime } from './display.js';
import type { DashboardData } from './types.js';

function Metric({
  label,
  value,
  icon,
  tone,
  href,
}: {
  readonly label: string;
  readonly value: number;
  readonly icon: ReactNode;
  readonly tone?: 'warning';
  readonly href: string;
}): ReactElement {
  return (
    <Link
      to={href}
      className='group rounded-xl border bg-card p-4 text-card-foreground shadow-xs transition-colors hover:border-primary/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
    >
      <div className='flex items-center justify-between gap-3'>
        <span className='text-sm text-muted-foreground'>{label}</span>
        <span
          className={
            tone === 'warning'
              ? 'text-(--status-warning)'
              : 'text-muted-foreground'
          }
        >
          {icon}
        </span>
      </div>
      <div className='mt-3 text-3xl font-semibold tracking-tight tabular-nums'>
        {value}
      </div>
      <span className='mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground'>
        <ArrowRightIcon className='size-3' />
      </span>
    </Link>
  );
}

export default function HelpdeskDashboard(): ReactElement {
  const { t, i18n } = useTranslation();
  const request = useApiData<{ data: DashboardData }>('helpdesk/dashboard');
  const canCreate = useCan({
    resource: { type: 'composite', id: 'helpdesk.tickets' },
    action: 'create',
  });
  const data = request.data?.data;

  return (
    <PageContainer>
      <PageHeader
        title={t('helpdesk.dashboard.title')}
        description={t('helpdesk.dashboard.description')}
        actions={
          canCreate.can ? (
            <Button
              nativeButton={false}
              render={<Link to='/helpdesk/tickets/create' />}
            >
              <PlusIcon data-icon='inline-start' />
              {t('helpdesk.tickets.create')}
            </Button>
          ) : undefined
        }
      />
      {request.error ? (
        <HelpdeskError error={request.error} retry={request.reload} />
      ) : request.loading && !data ? (
        <HelpdeskLoading rows={4} />
      ) : !data ? (
        <HelpdeskEmpty
          title={t('helpdesk.dashboard.emptyTitle')}
          description={t('helpdesk.dashboard.emptyDescription')}
        />
      ) : (
        <div className='flex flex-col gap-6'>
          <section
            aria-label={t('helpdesk.dashboard.totals')}
            className='grid gap-3 sm:grid-cols-2 xl:grid-cols-6'
          >
            <Metric
              label={t('helpdesk.metrics.all')}
              value={data.totals.all}
              icon={<InboxIcon className='size-4' />}
              href='/helpdesk/tickets'
            />
            <Metric
              label={t('helpdesk.metrics.unassigned')}
              value={data.totals.open}
              icon={<InboxIcon className='size-4' />}
              href='/helpdesk/tickets?status=open'
            />
            <Metric
              label={t('helpdesk.status.processing')}
              value={data.totals.processing}
              icon={<LoaderCircleIcon className='size-4' />}
              href='/helpdesk/tickets?status=processing'
            />
            <Metric
              label={t('helpdesk.metrics.overdue')}
              value={data.totals.overdue}
              icon={<Clock3Icon className='size-4' />}
              tone='warning'
              href='/helpdesk/tickets?overdue=true'
            />
            <Metric
              label={t('helpdesk.status.resolved')}
              value={data.totals.resolved}
              icon={<ShieldCheckIcon className='size-4' />}
              href='/helpdesk/tickets?status=resolved'
            />
            <Metric
              label={t('helpdesk.metrics.closed')}
              value={data.totals.closed}
              icon={<CircleAlertIcon className='size-4' />}
              href='/helpdesk/tickets?status=closed'
            />
          </section>

          <Card className='gap-0 overflow-hidden py-0'>
            <CardHeader className='flex-row items-center gap-2 border-b py-4'>
              <UsersIcon className='size-4 text-muted-foreground' />
              <div className='flex flex-col gap-0.5'>
                <CardTitle>{t('helpdesk.dashboard.workload')}</CardTitle>
                <p className='text-xs text-muted-foreground'>
                  {t('helpdesk.dashboard.workloadHint')}
                </p>
              </div>
            </CardHeader>
            <CardContent className='p-0'>
              {data.workload.length === 0 ? (
                <p className='p-6 text-sm text-muted-foreground'>
                  {t('helpdesk.dashboard.noEngineers')}
                </p>
              ) : (
                <div className='overflow-x-auto'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          {t('helpdesk.dashboard.engineer')}
                        </TableHead>
                        <TableHead className='text-end'>
                          {t('helpdesk.status.processing')}
                        </TableHead>
                        <TableHead className='text-end'>
                          {t('helpdesk.status.resolved')}
                        </TableHead>
                        <TableHead className='text-end'>
                          {t('helpdesk.status.closed')}
                        </TableHead>
                        <TableHead className='text-end'>
                          {t('helpdesk.dashboard.assignedTotal')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.workload.map((engineer) => (
                        <TableRow key={engineer.id}>
                          <TableCell>
                            <div className='flex flex-col'>
                              <span className='font-medium'>
                                {engineer.name || engineer.email || engineer.id}
                              </span>
                              {engineer.name && engineer.email ? (
                                <span className='text-xs text-muted-foreground'>
                                  {engineer.email}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className='text-end tabular-nums'>
                            {engineer.processing}
                          </TableCell>
                          <TableCell className='text-end tabular-nums'>
                            {engineer.resolved}
                          </TableCell>
                          <TableCell className='text-end tabular-nums'>
                            {engineer.closed}
                          </TableCell>
                          <TableCell className='text-end font-medium tabular-nums'>
                            {engineer.total}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className='grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]'>
            <Card className='gap-0 overflow-hidden py-0'>
              <CardHeader className='flex-row items-center justify-between border-b py-4'>
                <CardTitle>{t('helpdesk.dashboard.recent')}</CardTitle>
                <Button
                  nativeButton={false}
                  variant='ghost'
                  size='sm'
                  render={<Link to='/helpdesk/tickets' />}
                >
                  {t('helpdesk.actions.viewAll')}
                </Button>
              </CardHeader>
              <CardContent className='p-0'>
                {data.recent.length === 0 ? (
                  <p className='p-6 text-sm text-muted-foreground'>
                    {t('helpdesk.dashboard.noTickets')}
                  </p>
                ) : (
                  <div className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('helpdesk.fields.ticket')}</TableHead>
                          <TableHead>{t('helpdesk.fields.status')}</TableHead>
                          <TableHead>{t('helpdesk.fields.priority')}</TableHead>
                          <TableHead className='hidden sm:table-cell'>
                            {t('helpdesk.fields.category')}
                          </TableHead>
                          <TableHead className='text-end'>
                            {t('helpdesk.fields.updated')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.recent.map((ticket) => (
                          <TableRow key={ticket.id}>
                            <TableCell className='max-w-72 whitespace-normal'>
                              <TicketLink ticket={ticket}>
                                {ticket.ticketNo} · {ticket.title}
                              </TicketLink>
                            </TableCell>
                            <TableCell>
                              <StatusLabel status={ticket.status} />
                            </TableCell>
                            <TableCell>
                              <PriorityLabel priority={ticket.priority} />
                            </TableCell>
                            <TableCell className='hidden sm:table-cell'>
                              <CategoryLabel category={ticket.category} />
                            </TableCell>
                            <TableCell className='text-end whitespace-nowrap text-muted-foreground'>
                              {formatDateTime(ticket.updatedAt, i18n.language)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className='flex flex-col gap-4'>
              <Card>
                <CardHeader>
                  <CardTitle>{t('helpdesk.dashboard.byPriority')}</CardTitle>
                </CardHeader>
                <CardContent className='flex flex-col gap-3'>
                  {(['urgent', 'high', 'medium', 'low'] as const).map(
                    (priority) => (
                      <div
                        key={priority}
                        className='flex items-center justify-between gap-3 text-sm'
                      >
                        <PriorityLabel priority={priority} />
                        <span className='tabular-nums'>
                          {data.byPriority[priority] ?? 0}
                        </span>
                      </div>
                    ),
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('helpdesk.dashboard.byCategory')}</CardTitle>
                </CardHeader>
                <CardContent className='flex flex-col gap-3'>
                  {Object.entries(data.byCategory).length === 0 ? (
                    <p className='text-sm text-muted-foreground'>
                      {t('helpdesk.dashboard.noData')}
                    </p>
                  ) : (
                    Object.entries(data.byCategory).map(([category, count]) => (
                      <div
                        key={category}
                        className='flex items-center justify-between gap-3 text-sm'
                      >
                        <CategoryLabel category={category} />
                        <span className='tabular-nums'>{count}</span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
