import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertTriangleIcon,
  ClipboardCheckIcon,
  CpuIcon,
  TimerIcon,
  TicketIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress, ProgressLabel } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

import { useServiceRequest, type DashboardSummary } from '../api.js';
import { AsyncBlock, StatCard, StatusBadge, useAsyncData } from '../shared.js';

export default function ServiceDashboardPage(): ReactElement {
  const { t } = useTranslation();
  const request = useServiceRequest();
  const state = useAsyncData<DashboardSummary>(
    () => request<DashboardSummary>('/service/dashboard'),
    [request],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('service.dashboard.title')}
        description={t('service.dashboard.description')}
      />
      <AsyncBlock state={state}>
        {(summary) => (
          <>
            <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
              <StatCard
                icon={<TicketIcon className='size-5' />}
                label={t('service.dashboard.totalTickets')}
                value={summary.tickets.total}
                hint={t('service.dashboard.scope.' + summary.scope)}
              />
              <StatCard
                icon={<TimerIcon className='size-5' />}
                label={t('service.dashboard.openTickets')}
                value={summary.tickets.open}
                hint={t('service.dashboard.pendingHint', {
                  count: summary.tickets.pending,
                })}
              />
              <StatCard
                icon={<AlertTriangleIcon className='size-5' />}
                label={t('service.dashboard.urgentTickets')}
                value={summary.tickets.urgent}
                hint={t('service.dashboard.overdueHint', {
                  count: summary.tickets.overdue,
                })}
              />
              <StatCard
                icon={<ClipboardCheckIcon className='size-5' />}
                label={t('service.dashboard.overdueInspections')}
                value={summary.inspections.overdue}
                hint={t('service.dashboard.inspectionsHint', {
                  total: summary.inspections.total,
                })}
              />
            </div>

            <div className='grid gap-4 lg:grid-cols-2'>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {t('service.dashboard.statusBreakdown')}
                  </CardTitle>
                  <CardDescription>
                    {t('service.dashboard.statusBreakdownHint')}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-3'>
                  {Object.entries(summary.tickets.byStatus).map(
                    ([status, count]) => (
                      <div
                        className='flex items-center justify-between gap-3'
                        key={status}
                      >
                        <StatusBadge status={status} />
                        <span className='text-sm tabular-nums text-muted-foreground'>
                          {count}
                        </span>
                      </div>
                    ),
                  )}
                  <Separator />
                  <div className='flex items-center justify-between text-sm'>
                    <span className='text-muted-foreground'>
                      {t('service.dashboard.closedTickets')}
                    </span>
                    <span className='tabular-nums'>
                      {summary.tickets.closed}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('service.dashboard.deviceHealth')}</CardTitle>
                  <CardDescription>
                    {t('service.dashboard.deviceHealthHint')}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <Progress
                    value={
                      summary.devices.total
                        ? (summary.devices.active / summary.devices.total) * 100
                        : 0
                    }
                  >
                    <ProgressLabel>
                      {t('service.dashboard.activeDevices')}
                    </ProgressLabel>
                    <span className='ml-auto text-sm tabular-nums'>
                      {summary.devices.active}/{summary.devices.total}
                    </span>
                  </Progress>
                  <div className='grid grid-cols-3 gap-3 text-sm'>
                    <div className='flex items-center gap-2'>
                      <CpuIcon className='size-4 text-muted-foreground' />
                      {summary.devices.maintenance}
                    </div>
                    <div className='text-muted-foreground'>
                      {t('service.status.device.disabled')}
                    </div>
                    <div className='tabular-nums'>
                      {summary.devices.disabled}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t('service.dashboard.workload')}</CardTitle>
                <CardDescription>
                  {t('service.dashboard.workloadHint')}
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                {summary.workload.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>
                    {t('service.empty.title')}
                  </p>
                ) : (
                  summary.workload.map((engineer) => (
                    <div
                      className='flex items-center justify-between gap-4'
                      key={engineer.engineerId}
                    >
                      <span className='text-sm'>{engineer.name}</span>
                      <div className='flex flex-1 items-center gap-3'>
                        <Progress
                          className='flex-1'
                          value={
                            summary.tickets.open
                              ? (engineer.open / summary.tickets.open) * 100
                              : 0
                          }
                        />
                        <span className='w-8 text-right text-sm tabular-nums text-muted-foreground'>
                          {engineer.open}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </AsyncBlock>
    </PageContainer>
  );
}
