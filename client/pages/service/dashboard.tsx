import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useServiceApi } from '@/lib/service-api';
import { useAsync } from '@/lib/use-async';

import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  OrderPriorityBadge,
  OrderStatusBadge,
} from './shared.js';
import { formatDate } from './format.js';

export default function DashboardPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const summary = useAsync(() => api.dashboard(), [api]);

  return (
    <PageContainer>
      <PageHeader
        title={t('service.dashboard.title')}
        description={t('service.dashboard.description')}
        actions={
          <Button
            variant='outline'
            size='sm'
            onClick={summary.reload}
            disabled={summary.loading}
          >
            {t('service.common.refresh')}
          </Button>
        }
      />
      {summary.error ? (
        <ErrorBlock error={summary.error} onRetry={summary.reload} />
      ) : !summary.data ? (
        <LoadingBlock />
      ) : (
        <div className='space-y-6'>
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            <MetricCard
              label={t('service.dashboard.totalOrders')}
              value={summary.data.orders.total}
            />
            <MetricCard
              label={t('service.dashboard.awaitingMyAction')}
              value={summary.data.orders.awaitingMyAction}
              hint={t('service.dashboard.awaitingMyActionHint')}
            />
            <MetricCard
              label={t('service.dashboard.urgent')}
              value={summary.data.orders.urgent}
              tone={summary.data.orders.urgent > 0 ? 'warning' : undefined}
            />
            <MetricCard
              label={t('service.dashboard.overdue')}
              value={summary.data.orders.overdue}
              tone={summary.data.orders.overdue > 0 ? 'danger' : undefined}
            />
          </div>

          {summary.data.groups.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('service.dashboard.groups')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                  {summary.data.groups.map((group) => (
                    <div
                      key={group.id}
                      className='rounded-lg border border-border p-4'
                    >
                      <div className='text-sm font-medium'>{group.name}</div>
                      <div className='mt-1 text-xs text-muted-foreground'>
                        {group.code}
                      </div>
                      <div className='mt-3 flex items-end justify-between'>
                        <div>
                          <div className='text-2xl font-semibold tabular-nums'>
                            {group.openOrders}
                          </div>
                          <div className='text-xs text-muted-foreground'>
                            {t('service.dashboard.groupOpenOrders')}
                          </div>
                        </div>
                        <div className='text-right'>
                          <div className='text-2xl font-semibold tabular-nums'>
                            {group.engineers}
                          </div>
                          <div className='text-xs text-muted-foreground'>
                            {t('service.dashboard.groupEngineers')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className='grid gap-6 lg:grid-cols-3'>
            <Card className='lg:col-span-2'>
              <CardHeader className='flex flex-row items-center justify-between'>
                <CardTitle>{t('service.dashboard.recentOrders')}</CardTitle>
                <Button
                  variant='ghost'
                  size='sm'
                  render={<Link to='/service/orders' />}
                >
                  {t('service.dashboard.viewAll')}
                </Button>
              </CardHeader>
              <CardContent className='space-y-3'>
                {summary.data.recentOrders.length === 0 ? (
                  <EmptyBlock />
                ) : (
                  summary.data.recentOrders.map((order) => (
                    <div key={order.id}>
                      <Link
                        className='flex flex-col gap-1 py-1 hover:underline'
                        to={`/service/orders/${order.id}`}
                      >
                        <div className='flex items-center justify-between gap-2'>
                          <span className='font-medium'>{order.title}</span>
                          <OrderStatusBadge status={order.status} />
                        </div>
                        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                          <span>{order.orderNo}</span>
                          <span>·</span>
                          <span>{order.customer?.name ?? '—'}</span>
                          <span>·</span>
                          <OrderPriorityBadge priority={order.priority} />
                        </div>
                      </Link>
                      <Separator className='mt-3' />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between'>
                <CardTitle>{t('service.dashboard.inspections')}</CardTitle>
                <Button
                  variant='ghost'
                  size='sm'
                  render={<Link to='/service/inspections' />}
                >
                  {t('service.dashboard.viewAll')}
                </Button>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid grid-cols-2 gap-3'>
                  <MetricCard
                    label={t('service.dashboard.pendingInspections')}
                    value={summary.data.inspections.pending}
                  />
                  <MetricCard
                    label={t('service.dashboard.overdueInspections')}
                    value={summary.data.inspections.overdue}
                    tone={
                      summary.data.inspections.overdue > 0
                        ? 'danger'
                        : undefined
                    }
                  />
                </div>
                {summary.data.myDeadlines.length === 0 ? (
                  <EmptyBlock title={t('service.dashboard.noDeadlines')} />
                ) : (
                  <ul className='space-y-2 text-sm'>
                    {summary.data.myDeadlines.slice(0, 5).map((item) => (
                      <li
                        key={item.id}
                        className='flex items-center justify-between gap-2'
                      >
                        <span>#{item.deviceId}</span>
                        <span className='text-muted-foreground'>
                          {formatDate(item.planDate)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
