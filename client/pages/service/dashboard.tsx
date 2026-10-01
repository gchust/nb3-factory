import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangleIcon,
  ClipboardListIcon,
  HardDriveIcon,
  PlusIcon,
  RefreshCwIcon,
  StethoscopeIcon,
  UsersIcon,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
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
import { cn } from '@/lib/utils';

import {
  useServiceResource,
  type Assignee,
  type DashboardSummary,
} from './model.js';
import { ErrorState, LoadingState } from './shared.js';

function StatCard({
  title,
  value,
  icon,
  href,
  tone,
}: {
  readonly title: string;
  readonly value: ReactNode;
  readonly icon: ReactNode;
  readonly href: string;
  readonly tone?: 'warning' | 'danger';
}): ReactElement {
  return (
    <Card
      className={cn(
        'transition-colors',
        tone === 'danger' && 'border-destructive/40',
        tone === 'warning' && 'border-amber-500/40',
      )}
    >
      <CardHeader className='flex flex-row items-center justify-between gap-2 space-y-0'>
        <CardTitle className='text-sm font-medium text-muted-foreground'>
          {title}
        </CardTitle>
        <span className='text-muted-foreground'>{icon}</span>
      </CardHeader>
      <CardContent>
        <Link
          to={href}
          className='font-heading text-3xl font-semibold tracking-tight hover:underline'
        >
          {value}
        </Link>
      </CardContent>
    </Card>
  );
}

export default function ServiceDashboardPage(): ReactElement {
  const { t } = useTranslation();
  const summary = useServiceResource<DashboardSummary>('dashboard');
  const assignees = useServiceResource<Assignee[]>('assignees');

  if (summary.loading) {
    return (
      <PageContainer>
        <PageHeader
          title={t('navigation.dashboard')}
          description={t('service.dashboard.description')}
        />
        <LoadingState />
      </PageContainer>
    );
  }

  if (summary.error || !summary.data) {
    return (
      <PageContainer>
        <PageHeader
          title={t('navigation.dashboard')}
          description={t('service.dashboard.description')}
        />
        <ErrorState
          message={summary.error ?? t('service.loadFailed')}
          onRetry={summary.reload}
        />
      </PageContainer>
    );
  }

  const data = summary.data;
  const assigneeName = (id: string): string =>
    assignees.data?.find((entry) => entry.id === id)?.name ?? id;
  const workload = Object.entries(data.workOrders.byAssignee)
    .map(([id, count]) => ({ id, name: assigneeName(id), count }))
    .sort((left, right) => right.count - left.count);

  return (
    <PageContainer>
      <PageHeader
        title={t('navigation.dashboard')}
        description={t('service.dashboard.description')}
        actions={
          <>
            <Button
              type='button'
              variant='outline'
              onClick={summary.reload}
              disabled={summary.loading}
            >
              <RefreshCwIcon data-icon='inline-start' />
              {t('service.refresh')}
            </Button>
            <Button
              nativeButton={false}
              render={<Link to='/work-orders/new' />}
            >
              <PlusIcon data-icon='inline-start' />
              {t('service.workOrders.create')}
            </Button>
          </>
        }
      />

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <StatCard
          title={t('service.status.pending_accept')}
          value={data.workOrders.byStatus.pending_accept ?? 0}
          icon={<ClipboardListIcon className='size-4' />}
          href='/work-orders?status=pending_accept'
          tone='warning'
        />
        <StatCard
          title={t('service.status.pending_confirm')}
          value={data.workOrders.byStatus.pending_confirm ?? 0}
          icon={<StethoscopeIcon className='size-4' />}
          href='/work-orders?status=pending_confirm'
        />
        <StatCard
          title={t('service.dashboard.overdue')}
          value={data.workOrders.overdue}
          icon={<AlertTriangleIcon className='size-4' />}
          href='/work-orders?overdue=1'
          tone='danger'
        />
        <StatCard
          title={t('service.dashboard.total')}
          value={data.workOrders.total}
          icon={<ClipboardListIcon className='size-4' />}
          href='/work-orders'
        />
        <StatCard
          title={t('navigation.customers')}
          value={data.customers}
          icon={<UsersIcon className='size-4' />}
          href='/customers'
        />
        <StatCard
          title={t('navigation.devices')}
          value={data.devices}
          icon={<HardDriveIcon className='size-4' />}
          href='/devices'
        />
        <StatCard
          title={t('service.dashboard.pendingInspections')}
          value={data.pendingInspections}
          icon={<StethoscopeIcon className='size-4' />}
          href='/inspections'
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('service.dashboard.workload')}</CardTitle>
          <CardDescription>
            {t('service.dashboard.workloadDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workload.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('service.dashboard.noWorkload')}
            </p>
          ) : (
            <ul className='divide-y'>
              {workload.map((entry) => (
                <li
                  key={entry.id}
                  className='flex items-center justify-between py-2 text-sm'
                >
                  <span>{entry.name}</span>
                  <span className='font-medium'>{entry.count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
