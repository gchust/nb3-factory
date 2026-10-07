import { useTranslation } from '@nocobase/i18n/client';
import { ArrowRightIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container.js';
import { PageHeader } from '@/components/page-header.js';
import { PriorityBadge, WorkOrderStatusBadge } from '@/components/service/badges.js';
import { formatDate, formatDateTime } from '@/components/service/format.js';
import { EmptyTable } from '@/components/service/states.js';
import type { OverviewView } from '@/components/service/types.js';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useApiQuery } from '@/hooks/use-service-api.js';

interface StatCardProps {
  readonly label: ReactNode;
  readonly value: number;
  readonly to?: string;
  readonly note?: ReactNode;
}

function StatCard({ label, value, to, note }: StatCardProps): ReactElement {
  const content = (
    <Card className={to ? 'transition-colors hover:border-primary/60' : undefined}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className='text-3xl tabular-nums'>{value}</CardTitle>
        {note ? <p className='text-xs text-muted-foreground'>{note}</p> : null}
      </CardHeader>
    </Card>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

export default function DashboardPage(): ReactElement {
  const { t } = useTranslation();
  const overview = useApiQuery<{ data: OverviewView }>('/overview');
  const view = overview.data?.data;

  if (!view) {
    return (
      <PageContainer>
        <PageHeader title={t('service.dashboard.title')} />
        {overview.error ? (
          <EmptyTable
            title={t('service.error.requestFailed')}
            description={String((overview.error as Error).message ?? '')}
          />
        ) : (
          <p className='text-sm text-muted-foreground'>{t('service.loading')}</p>
        )}
      </PageContainer>
    );
  }

  const { totals, groupWorkload, urgentQueue, recentOrders, myTodayInspections } =
    view;

  return (
    <PageContainer>
      <PageHeader
        title={t('service.dashboard.title')}
        description={t('service.dashboard.description')}
      />

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <StatCard
          label={t('service.dashboard.pendingAcceptance')}
          value={totals.pendingAcceptance}
          to='/workOrders?status=pending_acceptance'
        />
        <StatCard
          label={t('service.dashboard.pendingConfirmation')}
          value={totals.pendingConfirmation}
          to='/workOrders?status=pending_confirmation'
        />
        <StatCard
          label={t('service.dashboard.overdue')}
          value={totals.overdueOrders}
          to='/workOrders?overdue=1'
        />
        <StatCard
          label={t('service.dashboard.urgent')}
          value={totals.urgentOpenOrders}
          to='/workOrders?priority=urgent'
        />
      </div>

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <StatCard
          label={t('service.dashboard.openOrders')}
          value={totals.openOrders}
          to='/workOrders?open=1'
        />
        <StatCard
          label={t('service.dashboard.pendingInspections')}
          value={totals.pendingInspections}
          to='/inspections?status=pending'
        />
        <StatCard
          label={t('service.dashboard.devices')}
          value={totals.devices}
          to='/devices'
        />
        <StatCard
          label={t('service.dashboard.customers')}
          value={totals.customers}
          to='/customers'
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('service.dashboard.groupWorkload')}</CardTitle>
          <CardDescription>
            {t('service.dashboard.groupWorkloadHint')}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-wrap gap-4'>
          {groupWorkload.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('service.empty.title')}
            </p>
          ) : (
            groupWorkload.map((group) => (
              <Link
                key={group.groupId ?? 'ungrouped'}
                to={`/workOrders?groupId=${encodeURIComponent(group.groupId ?? '')}`}
                className='flex min-w-44 flex-1 items-center justify-between rounded-lg border border-border px-4 py-3 transition-colors hover:border-primary/60'
              >
                <span className='text-sm font-medium'>
                  {group.groupName ?? t('service.dashboard.ungrouped')}
                </span>
                <span className='flex items-center gap-2'>
                  <Badge variant='secondary' className='tabular-nums'>
                    {group.openOrders}
                  </Badge>
                  <ArrowRightIcon className='size-4 text-muted-foreground' />
                </span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('service.dashboard.urgentQueue')}</CardTitle>
          <CardDescription>{t('service.dashboard.urgentQueueHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          {urgentQueue.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('service.empty.title')}
            </p>
          ) : (
            <ul className='divide-y divide-border'>
              {urgentQueue.map((order) => (
                <li key={order.id}>
                  <Link
                    to={`/workOrders/${order.id}`}
                    className='flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm hover:text-primary'
                  >
                    <span className='font-mono text-xs text-muted-foreground'>
                      {order.orderNo}
                    </span>
                    <span className='font-medium'>{order.title}</span>
                    <PriorityBadge priority={order.priority} />
                    <WorkOrderStatusBadge status={order.status} />
                    <span className='ml-auto text-xs text-muted-foreground'>
                      {formatDateTime(order.lastActivityAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>{t('service.dashboard.myInspections')}</CardTitle>
            <CardDescription>
              {t('service.dashboard.myInspectionsHint')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {myTodayInspections.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('service.empty.title')}
              </p>
            ) : (
              <ul className='divide-y divide-border'>
                {myTodayInspections.map((task) => (
                  <li key={task.id} className='py-3 text-sm'>
                    <Link
                      to='/inspections?status=pending'
                      className='flex flex-wrap items-center gap-2 hover:text-primary'
                    >
                      <span className='font-medium'>
                        {task.deviceName ?? task.deviceCode ?? '—'}
                      </span>
                      <span className='text-xs text-muted-foreground'>
                        {formatDate(task.planDate)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('service.dashboard.recentOrders')}</CardTitle>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('service.empty.title')}
              </p>
            ) : (
              <ul className='divide-y divide-border'>
                {recentOrders.map((order) => (
                  <li key={order.id}>
                    <Link
                      to={`/workOrders/${order.id}`}
                      className='flex items-center gap-3 py-3 text-sm hover:text-primary'
                    >
                      <span className='font-mono text-xs text-muted-foreground'>
                        {order.orderNo}
                      </span>
                      <span className='truncate font-medium'>{order.title}</span>
                      <span className='ml-auto shrink-0'>
                        <WorkOrderStatusBadge status={order.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
