import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  ClipboardListIcon,
  InboxIcon,
  ShieldCheckIcon,
  UsersIcon,
} from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatCard,
  WorkOrderStatusBadge,
} from './components.js';
import {
  errorMessage,
  formatDate,
  getDashboard,
  getDirectory,
  listWorkOrders,
  type DashboardSummary,
  type Directory,
  type WorkOrder,
} from './data.js';

export default function ServiceDashboardPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [summary, setSummary] = useState<DashboardSummary>();
  const [directory, setDirectory] = useState<Directory>();
  const [recent, setRecent] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);

  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getDashboard(api),
      getDirectory(api).catch(() => ({ groups: [], profiles: [] })),
      listWorkOrders(api, { limit: 6 }),
    ])
      .then(([dashboard, people, orders]) => {
        if (controller.signal.aborted) return;
        setSummary(dashboard);
        setDirectory(people);
        setRecent(orders.items);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(cause));
        setLoading(false);
      });
    return () => controller.abort();
  }, [api, revision]);

  const nameById = new Map(
    (directory?.profiles ?? []).map((profile) => [
      profile.userId,
      profile.name,
    ]),
  );
  const groupById = new Map(
    (directory?.groups ?? []).map((group) => [group.id, group.name]),
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.dashboard.title')}
        description={t('service.dashboard.description')}
        actions={
          <>
            <Button
              variant='outline'
              render={<Link to='/service/inspections' />}
            >
              <ShieldCheckIcon />
              {t('service.nav.inspections')}
            </Button>
            <Button render={<Link to='/service/work-orders' />}>
              <ClipboardListIcon />
              {t('service.nav.workOrders')}
            </Button>
          </>
        }
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : summary ? (
        <>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <StatCard
              label={t('service.dashboard.pending')}
              value={summary.pending}
              hint={t('service.dashboard.pendingHint')}
            />
            <StatCard
              label={t('service.dashboard.processing')}
              value={summary.processing + summary.pendingConfirmation}
              hint={t('service.dashboard.processingHint')}
            />
            <StatCard
              label={t('service.dashboard.overdue')}
              value={summary.overdue}
              tone={summary.overdue > 0 ? 'warning' : 'default'}
              hint={t('service.dashboard.overdueHint')}
            />
            <StatCard
              label={t('service.dashboard.closed')}
              value={summary.closed}
              hint={t('service.dashboard.closedHint')}
            />
          </div>

          <div className='grid gap-4 lg:grid-cols-3'>
            <Card className='lg:col-span-2'>
              <CardHeader>
                <CardTitle>{t('service.dashboard.recent')}</CardTitle>
                <CardDescription>
                  {t('service.dashboard.recentDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {recent.length === 0 ? (
                  <EmptyState
                    title={t('service.workOrders.emptyTitle')}
                    description={t('service.workOrders.emptyDescription')}
                  />
                ) : (
                  <ul className='divide-y'>
                    {recent.map((order) => (
                      <li
                        key={order.id}
                        className='flex items-center justify-between gap-3 py-3'
                      >
                        <div className='min-w-0'>
                          <Link
                            className='block truncate font-medium hover:underline'
                            to={`/service/work-orders/${order.id}`}
                          >
                            {order.title}
                          </Link>
                          <p className='text-xs text-muted-foreground'>
                            {order.code ?? `#${order.id}`} ·{' '}
                            {t('service.workOrders.deadline')}{' '}
                            {formatDate(order.deadline)}
                          </p>
                        </div>
                        <WorkOrderStatusBadge status={order.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <UsersIcon className='size-4' />
                  {t('service.dashboard.byEngineer')}
                </CardTitle>
                <CardDescription>
                  {t('service.dashboard.byEngineerDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {summary.byEngineer.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>
                    {t('service.dashboard.noEngineerLoad')}
                  </p>
                ) : (
                  <ul className='space-y-3'>
                    {summary.byEngineer.map((load) => (
                      <li
                        key={load.assigneeId ?? 'unassigned'}
                        className='flex items-center justify-between text-sm'
                      >
                        <span className='truncate'>
                          {load.assigneeId
                            ? (nameById.get(load.assigneeId) ?? load.assigneeId)
                            : t('service.workOrders.unassigned')}
                        </span>
                        <span className='tabular-nums font-medium'>
                          {load.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            <Link
              className='rounded-lg border p-4 transition-colors hover:bg-muted/50'
              to='/service/customers'
            >
              <UsersIcon className='mb-2 size-5 text-muted-foreground' />
              <p className='font-medium'>{t('service.nav.customers')}</p>
              <p className='text-sm text-muted-foreground'>
                {t('service.dashboard.customersHint')}
              </p>
            </Link>
            <Link
              className='rounded-lg border p-4 transition-colors hover:bg-muted/50'
              to='/service/notifications'
            >
              <InboxIcon className='mb-2 size-5 text-muted-foreground' />
              <p className='font-medium'>{t('service.nav.notifications')}</p>
              <p className='text-sm text-muted-foreground'>
                {t('service.dashboard.notificationsHint')}
              </p>
            </Link>
            <div className='rounded-lg border p-4'>
              <UsersIcon className='mb-2 size-5 text-muted-foreground' />
              <p className='font-medium'>{t('service.dashboard.groups')}</p>
              <p className='text-sm text-muted-foreground'>
                {directory?.groups
                  .map((group) => group.name ?? groupById.get(group.id))
                  .join(' · ') || t('service.dashboard.noGroups')}
              </p>
            </div>
          </div>
        </>
      ) : null}
    </PageContainer>
  );
}
