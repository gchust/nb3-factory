import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { PlayIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { PageContainer } from '@/components/page-container.js';
import { PageHeader } from '@/components/page-header.js';
import { formatDateTime } from '@/components/service/format.js';
import { EmptyTable, RequestError } from '@/components/service/states.js';
import type {
  OverdueReminderView,
  Paged,
  ScheduledRunView,
  ServiceGroupView,
  TaskListView,
  TaskRunResultView,
} from '@/components/service/types.js';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useApiQuery, useClient } from '@/hooks/use-service-api.js';

const RUN_STATUS: Record<ScheduledRunView['status'], string> = {
  running: 'service.operations.running',
  succeeded: 'service.operations.succeeded',
  failed: 'service.operations.failed',
};

export default function OperationsPage(): ReactElement {
  const { t } = useTranslation();
  const client = useClient();
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<TaskRunResultView | null>(null);

  const mayRun = useCan({
    resource: { type: 'composite', id: 'service.system' },
    action: 'runTask',
  });

  const tasks = useApiQuery<{ data: TaskListView }>('/serviceTasks');
  const taskList = tasks.data?.data?.tasks ?? [];
  const runs = useApiQuery<Paged<ScheduledRunView>>('/scheduledRuns', {
    pageSize: 50,
  });
  const reminders = useApiQuery<Paged<OverdueReminderView>>(
    '/overdueReminders',
    { pageSize: 50 },
  );
  const groups = useApiQuery<Paged<ServiceGroupView>>('/serviceGroups', {
    pageSize: 100,
  });

  const run = async (key: string) => {
    setRunning(key);
    setResult(null);
    try {
      const outcome = await client.request<{ data: TaskRunResultView }>({
        path: `/serviceTasks/${key}/run`,
        method: 'POST',
        json: {},
      });
      setResult(outcome.data);
      runs.reload();
      reminders.reload();
    } finally {
      setRunning(null);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.operations.title')}
        description={t('service.operations.description')}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('service.operations.tasks')}</CardTitle>
          <CardDescription>{t('service.operations.tasksHint')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          {tasks.error ? (
            <RequestError error={tasks.error} onRetry={tasks.reload} />
          ) : null}
          {taskList.map((task) => (
            <div
              key={task.key}
              className='flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2'
            >
              <div className='space-y-1'>
                <p className='text-sm font-medium'>{t(task.titleKey)}</p>
                <p className='text-xs text-muted-foreground'>
                  {t(task.descriptionKey)}
                </p>
                <p className='text-xs text-muted-foreground'>
                  {task.cron} · {task.timezone}
                  {task.lastRun
                    ? ` · ${t('service.operations.lastRun')}: ${formatDateTime(task.lastRun.createdAt)} (${t(RUN_STATUS[task.lastRun.status])})`
                    : ` · ${t('service.operations.neverRun')}`}
                </p>
              </div>
              {mayRun.can ? (
                <Button
                  size='sm'
                  variant='outline'
                  disabled={running === task.key}
                  onClick={() => void run(task.key)}
                >
                  <PlayIcon />
                  {t('service.operations.runNow')}
                </Button>
              ) : null}
            </div>
          ))}
          {tasks.data && taskList.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('service.operations.noTasks')}
            </p>
          ) : null}
          {result ? (
            <p className='rounded-md bg-muted px-3 py-2 text-sm'>
              {t('service.operations.runResult', {
                date: result.runDate,
                inspections: result.summary.pendingInspections,
                overdue: result.summary.overdueOrders,
              })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('service.operations.groups')}</CardTitle>
          <CardDescription>{t('service.operations.groupsHint')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-2'>
          {groups.error ? (
            <RequestError error={groups.error} onRetry={groups.reload} />
          ) : null}
          {(groups.data?.data ?? []).map((group) => (
            <div
              key={group.id}
              className='flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm'
            >
              <span>
                {group.name}{' '}
                <span className='font-mono text-xs text-muted-foreground'>
                  {group.code}
                </span>
              </span>
              <span className='text-xs text-muted-foreground'>
                {t('service.operations.memberCount', {
                  count: group.memberCount,
                })}
              </span>
            </div>
          ))}
          {groups.data && groups.data.data.length === 0 ? (
            <EmptyTable title={t('service.operations.noGroups')} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('service.operations.runs')}</CardTitle>
          <CardDescription>{t('service.operations.runsHint')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-2'>
          {runs.error ? (
            <RequestError error={runs.error} onRetry={runs.reload} />
          ) : null}
          {(runs.data?.data ?? []).map((row) => (
            <div
              key={row.id}
              className='flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm'
            >
              <span>
                {row.taskKey} · {row.runDate}
              </span>
              <span className='text-xs text-muted-foreground'>
                {t(RUN_STATUS[row.status])}
                {row.summary ? ` · ${row.summary}` : ''}
              </span>
            </div>
          ))}
          {runs.data && runs.data.data.length === 0 ? (
            <EmptyTable title={t('service.operations.noRuns')} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('service.operations.reminders')}</CardTitle>
          <CardDescription>
            {t('service.operations.remindersHint')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-2'>
          {reminders.error ? (
            <RequestError error={reminders.error} onRetry={reminders.reload} />
          ) : null}
          {(reminders.data?.data ?? []).map((row) => (
            <div
              key={row.id}
              className='flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm'
            >
              <span>
                {row.orderNo ?? row.workOrderId} ·{' '}
                {row.orderTitle ?? t('service.operations.untitled')}
              </span>
              <span className='text-xs text-muted-foreground'>
                {row.sentDate} · {row.recipientName ?? row.recipientId}
              </span>
            </div>
          ))}
          {reminders.data && reminders.data.data.length === 0 ? (
            <EmptyTable title={t('service.operations.noReminders')} />
          ) : null}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
