import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Outlet } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ErrorState,
  LoadingState,
  StatusBadge,
} from '@/pages/service/shared.js';
import {
  TICKET_STATUSES,
  useServiceObject,
} from '@/pages/service/service-api.js';
import type { DashboardSummary } from '@/pages/service/types.js';

interface StatProps {
  readonly label: string;
  readonly value: number;
  readonly hint?: string;
}

function Stat({ label, value, hint }: StatProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className='text-3xl tabular-nums'>{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent className='text-xs text-muted-foreground'>
          {hint}
        </CardContent>
      ) : null}
    </Card>
  );
}

export default function ServiceDashboardPage(): ReactElement {
  const { t } = useTranslation();
  const { data, error, loading, reload } =
    useServiceObject<DashboardSummary>('service/dashboard');

  return (
    <PageContainer>
      <PageHeader
        title={t('service.dashboard.title')}
        description={t('service.dashboard.description')}
      />
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <Stat label={t('service.dashboard.open')} value={data.myOpen} />
            <Stat label={t('service.dashboard.overdue')} value={data.overdue} />
            <Stat
              label={t('service.dashboard.urgent')}
              value={data.urgentOpen}
            />
            <Stat
              label={t('service.dashboard.messages')}
              value={data.unreadMessages}
            />
            <Stat
              label={t('service.dashboard.inspectionsToday')}
              value={data.pendingInspectionsToday}
            />
            <Stat label={t('service.dashboard.total')} value={data.total} />
            {data.acceptanceFailures > 0 ? (
              <Stat
                label={t('service.dashboard.failures')}
                value={data.acceptanceFailures}
                hint={t('service.operations.failureHint')}
              />
            ) : null}
          </div>
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>
                {t('service.dashboard.byStatus')}
              </CardTitle>
            </CardHeader>
            <CardContent className='flex flex-wrap gap-6'>
              {TICKET_STATUSES.map((status) => (
                <div key={status} className='space-y-1'>
                  <StatusBadge status={status} />
                  <p className='text-2xl font-semibold tabular-nums'>
                    {data.byStatus[status] ?? 0}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>
                {t('service.dashboard.byEngineer')}
              </CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              {data.byEngineer.map((engineer) => (
                <div key={engineer.engineerId} className='space-y-1'>
                  <p className='text-sm font-medium'>{engineer.name}</p>
                  <p className='text-2xl font-semibold tabular-nums'>
                    {engineer.open}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {t('service.dashboard.engineerOpen', {
                      open: engineer.open,
                      total: engineer.total,
                    })}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
      <Outlet />
    </PageContainer>
  );
}
