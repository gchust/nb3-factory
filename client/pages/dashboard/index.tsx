import { useTranslation } from '@nocobase/i18n/client';
import { RefreshCw } from 'lucide-react';
import { useCallback, useMemo, type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import { getDashboardSummary } from '@/api/service';
import type { ApiClient } from '@nocobase/app-client';
import type { DashboardSummary } from '@/api/service-types';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { ServiceTable } from '@/components/service/service-table';
import { OrderStatusBadge } from '@/components/service/status-badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useServiceResource } from '@/hooks/use-service-resource';

interface MetricProps {
  readonly label: string;
  readonly hint: string;
  readonly value: number | undefined;
}

function Metric({ hint, label, value }: MetricProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className='text-3xl'>
          {value === undefined ? <Skeleton className='h-8 w-14' /> : value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className='text-xs text-muted-foreground'>{hint}</p>
      </CardContent>
    </Card>
  );
}

/**
 * The supervisor's and engineer's starting point.
 *
 * It is one read of the dashboard endpoint, which the server already scopes to
 * the caller's permission policies, so an engineer sees their own orders and a
 * supervisor sees the whole team's without the page deciding who is who.
 *
 * The recent-orders table links into the order drawer declared under this same
 * route, so a record opens over the page the user is on rather than jumping to
 * the order list.
 */
export default function ServiceDashboardPage(): ReactElement {
  const { t } = useTranslation();
  const load = useCallback(
    (client: ApiClient, signal: AbortSignal) =>
      getDashboardSummary(client, signal),
    [],
  );
  const { data, error, isPending, reload } = useServiceResource(
    'service-dashboard',
    load,
  );

  const outletContext = useMemo(() => ({ reload }), [reload]);
  const orderLinks = data?.recentOrders ?? [];
  const byStatus = useMemo(
    () =>
      Object.entries(data?.byStatus ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    [data?.byStatus],
  );
  const summary: DashboardSummary | undefined = data;

  return (
    <PageContainer>
      <PageHeader
        title={t('service.dashboard.title')}
        description={t('service.dashboard.description')}
        actions={
          <Button onClick={reload} size='sm' variant='outline'>
            <RefreshCw aria-hidden='true' />
            {t('service.actions.refresh')}
          </Button>
        }
      />

      {error ? <ServiceErrorNotice error={error} onRetry={reload} /> : null}

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-5'>
        <Metric
          hint={t('service.dashboard.openOrdersHint')}
          label={t('service.dashboard.openOrders')}
          value={summary?.openOrders}
        />
        <Metric
          hint={t('service.dashboard.overdueOrdersHint')}
          label={t('service.dashboard.overdueOrders')}
          value={summary?.overdueOrders}
        />
        <Metric
          hint={t('service.dashboard.myOrdersHint')}
          label={t('service.dashboard.myOrders')}
          value={summary?.myOrders}
        />
        <Metric
          hint={t('service.dashboard.pendingInspectionsHint')}
          label={t('service.dashboard.pendingInspections')}
          value={summary?.pendingInspections}
        />
        <Metric
          hint={t('service.dashboard.devicesDueHint')}
          label={t('service.dashboard.devicesDue')}
          value={summary?.devicesDue}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('service.dashboard.byStatus')}</CardTitle>
        </CardHeader>
        <CardContent>
          {summary === undefined && isPending ? (
            <Skeleton className='h-6 w-full' />
          ) : byStatus.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('service.common.empty')}
            </p>
          ) : (
            <ul className='flex flex-wrap gap-6'>
              {byStatus.map(([status, count]) => (
                <li className='flex items-center gap-2' key={status}>
                  <OrderStatusBadge status={status} />
                  <span className='font-heading text-xl font-semibold tabular-nums'>
                    {count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Only a principal with a team-wide dashboard grant receives group
          counts; the server omits them for a row-scoped engineer. */}
      {(summary?.groupCounts.length ?? 0) > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('service.dashboard.groupLoad')}</CardTitle>
            <CardDescription>
              {t('service.dashboard.groupLoadHint')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className='flex flex-wrap gap-6'>
              {(summary?.groupCounts ?? []).map((group) => (
                <li className='flex items-center gap-2' key={group.groupId}>
                  <span className='text-sm text-muted-foreground'>
                    {group.name}
                  </span>
                  <span className='font-heading text-xl font-semibold tabular-nums'>
                    {group.orders}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <section className='space-y-3'>
        <h2 className='font-heading text-xl font-semibold'>
          {t('service.dashboard.recentOrders')}
        </h2>
        <ServiceTable
          caption={t('service.dashboard.recentOrders')}
          columns={[
            {
              key: 'orderNo',
              header: t('service.orders.orderNo'),
              cell: (order) => (
                <Link
                  className='font-medium underline-offset-4 hover:underline'
                  to={String(order.id)}
                >
                  {order.orderNo}
                </Link>
              ),
            },
            {
              key: 'title',
              header: t('service.orders.orderTitle'),
              cell: (order) => order.title,
            },
            {
              key: 'status',
              header: t('service.orders.status'),
              cell: (order) => <OrderStatusBadge status={order.status} />,
            },
            {
              key: 'dueAt',
              header: t('service.orders.dueAt'),
              cell: (order) => order.dueAt ?? '—',
            },
          ]}
          empty={t('service.dashboard.recentOrdersEmpty')}
          isPending={isPending}
          rowKey={(order) => String(order.id)}
          rows={orderLinks}
        />
      </section>

      <Outlet context={outletContext} />
    </PageContainer>
  );
}
