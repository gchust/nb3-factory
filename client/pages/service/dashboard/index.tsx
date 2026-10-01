import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  InboxIcon,
  LockIcon,
} from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { fetchDashboard, type DashboardData } from '../api.js';
import { LoadingBlock, QueryError, StatusBadge } from '../shared.js';

/**
 * The dashboard: supervisors see the whole queue, engineers only their own
 * workload, and the endpoint decides which. This page only lays the numbers
 * out.
 */
export default function DashboardPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [reloadCount, setReloadCount] = useState(0);
  const [state, setState] = useState<{
    key: string;
    dashboard?: DashboardData;
    error?: unknown;
  }>();

  const requestKey = String(reloadCount);
  useEffect(() => {
    const controller = new AbortController();
    fetchDashboard(api).then(
      (dashboard) => {
        if (!controller.signal.aborted)
          setState({ key: String(reloadCount), dashboard });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setState({ key: String(reloadCount), error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = state?.key !== requestKey;
  const data = state?.dashboard;

  return (
    <PageContainer>
      <PageHeader
        title={t('service.dashboard.title')}
        description={
          data?.scope === 'own'
            ? t('service.dashboard.ownScope')
            : t('service.dashboard.allScope')
        }
      />
      {state?.error ? (
        <QueryError
          error={state.error}
          onRetry={() => setReloadCount((count) => count + 1)}
        />
      ) : loading && !data ? (
        <LoadingBlock rows={3} />
      ) : data ? (
        <>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <MetricCard
              icon={<InboxIcon className='size-4' />}
              label={t('service.dashboard.metric.total')}
              value={data.counts.total}
            />
            <MetricCard
              icon={<AlertTriangleIcon className='size-4' />}
              label={t('service.dashboard.metric.overdue')}
              value={data.counts.overdue}
              tone='danger'
            />
            <MetricCard
              icon={<CalendarClockIcon className='size-4' />}
              label={t('service.dashboard.metric.devicesDue')}
              value={data.devicesDueInspection}
            />
            <MetricCard
              icon={<LockIcon className='size-4' />}
              label={t('service.dashboard.metric.confidential')}
              value={data.counts.confidential}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className='text-sm'>
                {t('service.dashboard.byStatus')}
              </CardTitle>
            </CardHeader>
            <CardContent className='grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
              {data.byStatus.map((item) => (
                <div key={item.status} className='rounded-lg border p-4'>
                  <StatusBadge status={item.status} />
                  <p className='mt-2 text-2xl font-semibold'>{item.count}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            <MetricCard
              icon={<CheckCircle2Icon className='size-4' />}
              label={t('service.dashboard.metric.pendingInspections')}
              value={data.pendingInspections}
            />
            <MetricCard
              icon={<CheckCircle2Icon className='size-4' />}
              label={t('service.dashboard.metric.knowledgePublished')}
              value={data.knowledgePublished}
            />
            <MetricCard
              icon={<CheckCircle2Icon className='size-4' />}
              label={t('service.dashboard.metric.knowledgeDrafts')}
              value={data.knowledgeDrafts}
            />
          </div>
        </>
      ) : null}
    </PageContainer>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone,
}: {
  readonly icon: ReactElement;
  readonly label: string;
  readonly value: number;
  readonly tone?: 'danger';
}): ReactElement {
  return (
    <Card>
      <CardContent className='flex items-center gap-4 pt-6'>
        <span
          className={
            tone === 'danger'
              ? 'flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive'
              : 'flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground'
          }
        >
          {icon}
        </span>
        <div>
          <p className='text-2xl font-semibold'>{value}</p>
          <p className='text-xs text-muted-foreground'>{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
