import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ClipboardList, Clock, Play, TriangleAlert } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useServiceApi } from '@/service/api.js';
import { runScheduleAndAwait } from '@/service/schedule.js';
import { useSession } from '@/service/session.js';
import {
  ErrorState,
  PageLoading,
  StatCard,
  errorMessage,
  formatDateTime,
  useAsync,
} from '@/service/ui.js';

/** The two business schedules this application owns, in display order. */
const SERVICE_SCHEDULES = [
  { key: 'service.daily-inspections', label: 'service.schedules.dailyTitle' },
  { key: 'service.overdue-reminders', label: 'service.schedules.overdueTitle' },
] as const;

/** The overview page: the counts the signed-in identity is allowed to see. */
export default function DashboardPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const { isSupervisor } = useSession();
  const { data, error, loading, reload } = useAsync(() => api.context());
  const dashboard = useAsync(() => api.dashboard(), []);
  const schedules = useAsync(
    () => (isSupervisor ? api.listSchedules() : Promise.resolve([])),
    [isSupervisor],
  );
  const [runningKey, setRunningKey] = useState<string>();

  const runNow = async (key: string): Promise<void> => {
    setRunningKey(key);
    try {
      const outcome = await runScheduleAndAwait(api, key);
      if (outcome.status === 'succeeded') {
        toaster.show({
          type: 'success',
          title: t('service.schedules.runSucceeded'),
          description:
            outcome.sent !== undefined
              ? t('service.schedules.remindersSent', { count: outcome.sent })
              : t('service.schedules.inspectionsCreated', {
                  count: outcome.created ?? 0,
                }),
        });
      } else if (outcome.status === 'disabled') {
        toaster.show({
          type: 'warning',
          title: t('service.schedules.disabled'),
          description: t('service.schedules.disabledHint'),
        });
      } else if (outcome.status === 'pending') {
        toaster.show({ type: 'info', title: t('service.schedules.pending') });
      } else {
        toaster.show({
          type: 'error',
          title: t('service.schedules.runFailed'),
          description: outcome.reason,
        });
      }
      schedules.reload();
      dashboard.reload();
    } catch (cause) {
      toaster.show({ type: 'error', title: errorMessage(cause) });
    } finally {
      setRunningKey(undefined);
    }
  };

  if (loading || dashboard.loading) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    );
  }
  if (error || dashboard.error) {
    return (
      <PageContainer>
        <ErrorState error={error ?? dashboard.error} onRetry={reload} />
      </PageContainer>
    );
  }

  const summary = dashboard.data;
  const counts = summary?.counts ?? {};
  const supervisor = data?.role.supervisor ?? false;

  return (
    <PageContainer>
      <PageHeader
        title={t('service.dashboard.title')}
        description={t('service.dashboard.description')}
      />

      {supervisor ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('service.schedules.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('service.schedules.name')}</TableHead>
                  <TableHead>{t('service.schedules.timezone')}</TableHead>
                  <TableHead>{t('service.schedules.state')}</TableHead>
                  <TableHead>{t('service.schedules.lastRun')}</TableHead>
                  <TableHead className='text-right'>
                    {t('service.schedules.completed')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('service.common.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SERVICE_SCHEDULES.map(({ key, label }) => {
                  const schedule = schedules.data?.find(
                    (row) => row.key === key,
                  );
                  return (
                    <TableRow key={key}>
                      <TableCell>{t(label)}</TableCell>
                      <TableCell>{schedule?.timezone ?? '—'}</TableCell>
                      <TableCell>
                        {schedule ? (
                          <Badge
                            variant={schedule.enabled ? 'default' : 'secondary'}
                          >
                            {schedule.enabled
                              ? t('service.schedules.enabled')
                              : t('service.schedules.disabledState')}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {formatDateTime(schedule?.lastRunAt)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {schedule?.completedCount ?? 0}
                      </TableCell>
                      <TableCell className='text-right'>
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={!schedule || runningKey === key}
                          onClick={() => void runNow(key)}
                        >
                          <Play />
                          {t('service.schedules.runNow')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className='mt-3 text-xs text-muted-foreground'>
              {t('service.schedules.hint')}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {supervisor ? (
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          <StatCard
            label={t('service.dashboard.pendingProcess')}
            value={counts.pending_process ?? 0}
          />
          <StatCard
            label={t('service.dashboard.pendingConfirm')}
            value={counts.pending_confirm ?? 0}
          />
          <StatCard
            label={t('service.dashboard.overdue')}
            value={summary?.overdue ?? 0}
            tone='danger'
          />
          <StatCard
            label={t('service.dashboard.totalOpen')}
            value={
              (counts.pending_accept ?? 0) +
              (counts.pending_process ?? 0) +
              (counts.processing ?? 0) +
              (counts.pending_confirm ?? 0)
            }
          />
        </div>
      ) : (
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          <StatCard
            label={t('service.dashboard.myPending')}
            value={(counts.pending_process ?? 0) + (counts.pending_accept ?? 0)}
          />
          <StatCard
            label={t('service.dashboard.myProcessing')}
            value={counts.processing ?? 0}
          />
          <StatCard
            label={t('service.dashboard.myPendingConfirm')}
            value={counts.pending_confirm ?? 0}
          />
          <StatCard
            label={t('service.dashboard.myClosed')}
            value={counts.closed ?? 0}
          />
        </div>
      )}

      {supervisor ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('service.dashboard.groupWorkload')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('service.dashboard.group')}</TableHead>
                  <TableHead className='text-right'>
                    {t('service.dashboard.groupTotal')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('service.dashboard.groupOpen')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary?.groups ?? []).map((group) => (
                  <TableRow key={group.group ?? group.name}>
                    <TableCell>
                      {t(`service.group.${group.group ?? group.name}`)}
                    </TableCell>
                    <TableCell className='text-right'>{group.total}</TableCell>
                    <TableCell className='text-right'>{group.open}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <div className='grid gap-4 text-sm text-muted-foreground sm:grid-cols-3'>
        <div className='flex items-center gap-2'>
          <ClipboardList className='size-4' />
          {t('service.dashboard.hintOrders')}
        </div>
        <div className='flex items-center gap-2'>
          <Clock className='size-4' />
          {t('service.dashboard.hintOverdue')}
        </div>
        <div className='flex items-center gap-2'>
          <TriangleAlert className='size-4' />
          {t('service.dashboard.hintScope')}
        </div>
      </div>
    </PageContainer>
  );
}
