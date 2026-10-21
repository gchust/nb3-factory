import type { ColumnDef } from '@tanstack/react-table';
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, ArrowLeftIcon, RefreshCwIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link, useParams } from 'react-router';

import { DataTable } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { StatusBadge } from '#components/status-badge';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Card, CardContent } from '#components/ui/card';

import {
  formatDateTime,
  occurrenceTone,
  scheduleDescription,
  scheduleTitle,
  targetTitle,
} from './text.js';
import type {
  OccurrenceListResponse,
  Schedule,
  ScheduleOccurrence,
  ScheduleResponse,
} from './types.js';

export default function SchedulerDetailPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const [schedule, setSchedule] = useState<Schedule>();
  const [occurrences, setOccurrences] = useState<readonly ScheduleOccurrence[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [reloadCount, setReloadCount] = useState(0);

  const load = useCallback(
    (id: string, signal: AbortSignal) => {
      const path = `scheduler/schedules/${encodeURIComponent(id)}`;
      return Promise.all([
        api.request<ScheduleResponse>({ path, signal }),
        api.request<OccurrenceListResponse>({
          path: `${path}/occurrences`,
          query: { pageSize: 100 },
          signal,
        }),
      ]);
    },
    [api],
  );

  const refresh = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setReloadCount((count) => count + 1);
  }, []);

  useEffect(() => {
    if (!scheduleId) return;

    const controller = new AbortController();

    void load(scheduleId, controller.signal)
      .then(([scheduleResponse, occurrenceResponse]) => {
        if (controller.signal.aborted) return;
        setSchedule(scheduleResponse.data);
        setOccurrences(occurrenceResponse.data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [load, reloadCount, scheduleId]);

  const format = useCallback(
    (value: string | undefined) => formatDateTime(value, i18n.language),
    [i18n.language],
  );

  const columns = useMemo<ColumnDef<ScheduleOccurrence>[]>(
    () => [
      {
        accessorKey: 'status',
        header: t('scheduler.occurrenceColumns.status'),
        cell: ({ row }) => (
          <StatusBadge tone={occurrenceTone[row.original.status]} size='sm'>
            {t(`scheduler.occurrenceStatus.${row.original.status}`)}
          </StatusBadge>
        ),
      },
      {
        accessorKey: 'startedAt',
        header: t('scheduler.occurrenceColumns.startedAt'),
        cell: ({ row }) => format(row.original.startedAt),
      },
      {
        accessorKey: 'finishedAt',
        header: t('scheduler.occurrenceColumns.finishedAt'),
        cell: ({ row }) => format(row.original.finishedAt),
      },
      {
        accessorKey: 'executionCount',
        header: t('scheduler.occurrenceColumns.executions'),
        cell: ({ row }) => row.original.executionCount,
      },
      {
        id: 'result',
        header: t('scheduler.occurrenceColumns.result'),
        cell: ({ row }) =>
          row.original.resultSummary
            ? JSON.stringify(row.original.resultSummary)
            : '—',
      },
      {
        accessorKey: 'reason',
        header: t('scheduler.occurrenceColumns.reason'),
        cell: ({ row }) => row.original.reason ?? '—',
      },
    ],
    [format, t],
  );

  return (
    <RouteChildPage>
      <PageContainer>
        <div>
          <Button
            variant='ghost'
            size='sm'
            nativeButton={false}
            render={
              <Link to='..'>
                <ArrowLeftIcon />
                {t('scheduler.back')}
              </Link>
            }
          />
        </div>
        <PageHeader
          title={
            schedule ? scheduleTitle(schedule, t) : t('scheduler.detailTitle')
          }
          description={
            schedule
              ? scheduleDescription(schedule, t)
              : t('scheduler.detailHint')
          }
          actions={
            <Button variant='outline' disabled={loading} onClick={refresh}>
              <RefreshCwIcon className={loading ? 'animate-spin' : undefined} />
              {t('scheduler.refresh')}
            </Button>
          }
        />
        {error ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertTitle>{t('scheduler.loadFailed')}</AlertTitle>
            <AlertDescription>{t('scheduler.loadFailedHint')}</AlertDescription>
            <AlertAction>
              <Button variant='outline' size='sm' onClick={refresh}>
                {t('scheduler.retry')}
              </Button>
            </AlertAction>
          </Alert>
        ) : null}
        {schedule ? (
          <Card>
            <CardContent>
              <dl className='grid gap-5 sm:grid-cols-2 lg:grid-cols-4'>
                <Field label={t('scheduler.fields.key')}>
                  <code className='text-xs'>{schedule.key}</code>
                </Field>
                <Field label={t('scheduler.fields.cron')}>
                  <code className='text-xs'>{schedule.cron}</code>
                </Field>
                <Field label={t('scheduler.fields.timezone')}>
                  {schedule.timezone}
                </Field>
                <Field label={t('scheduler.fields.enabled')}>
                  <StatusBadge
                    tone={schedule.enabled ? 'success' : 'neutral'}
                    size='sm'
                  >
                    {t(
                      schedule.enabled
                        ? 'scheduler.enabled'
                        : 'scheduler.disabled',
                    )}
                  </StatusBadge>
                </Field>
                <Field label={t('scheduler.fields.status')}>
                  <StatusBadge
                    tone={
                      schedule.scheduleStatus === 'active'
                        ? 'success'
                        : 'neutral'
                    }
                    size='sm'
                  >
                    {t(`scheduler.scheduleStatus.${schedule.scheduleStatus}`)}
                  </StatusBadge>
                </Field>
                <Field label={t('scheduler.fields.target')}>
                  {targetTitle(schedule, t)}
                </Field>
                <Field label={t('scheduler.fields.nextRun')}>
                  {format(schedule.nextRunAt)}
                </Field>
                <Field label={t('scheduler.fields.lastRun')}>
                  {format(schedule.lastRunAt)}
                </Field>
                <Field label={t('scheduler.fields.runs')}>
                  {t('scheduler.executionCounts', {
                    completed: schedule.completedCount,
                    total: schedule.runCount,
                  })}
                </Field>
              </dl>
            </CardContent>
          </Card>
        ) : null}
        <section className='space-y-3'>
          <div>
            <h2 className='font-heading text-lg font-medium'>
              {t('scheduler.history')}
            </h2>
            <p className='text-sm text-muted-foreground'>
              {t('scheduler.historyHint')}
            </p>
          </div>
          <DataTable
            columns={columns}
            data={occurrences}
            getRowId={(occurrence) => occurrence.id}
            loading={loading}
            pagination={false}
            emptyMessage={t('scheduler.noHistory')}
          />
        </section>
      </PageContainer>
    </RouteChildPage>
  );
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='min-w-0'>
      <dt className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
        {label}
      </dt>
      <dd className='mt-1 break-words'>{children}</dd>
    </div>
  );
}
