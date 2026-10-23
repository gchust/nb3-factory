import type { ColumnDef } from '@tanstack/react-table';
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircleIcon,
  CalendarClockIcon,
  HistoryIcon,
  RefreshCwIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { Link, Outlet } from 'react-router';

import { DataTable } from '#components/data-table';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Switch } from '#components/ui/switch';

import { formatDateTime, scheduleDescription, scheduleTitle } from './text.js';
import type {
  Schedule,
  ScheduleResponse,
  SchedulerListResponse,
} from './types.js';

export default function SchedulerPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const [schedules, setSchedules] = useState<readonly Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string>();
  const [error, setError] = useState<unknown>();
  const [reloadCount, setReloadCount] = useState(0);

  const load = useCallback(
    (signal: AbortSignal) =>
      api.request<SchedulerListResponse>({
        path: 'scheduler/schedules',
        query: { pageSize: 100 },
        signal,
      }),
    [api],
  );

  const refresh = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setReloadCount((count) => count + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void load(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setSchedules(response.data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [load, reloadCount]);

  const toggle = useCallback(
    async (schedule: Schedule, enabled: boolean) => {
      setSavingId(schedule.id);
      setError(undefined);
      try {
        const response = await api.request<ScheduleResponse>({
          path: `scheduler/schedules/${encodeURIComponent(schedule.id)}/${enabled ? 'enable' : 'disable'}`,
          method: 'POST',
        });
        setSchedules((current) =>
          current.map((item) =>
            item.id === response.data.id ? response.data : item,
          ),
        );
      } catch (reason) {
        setError(reason);
      } finally {
        setSavingId(undefined);
      }
    },
    [api],
  );

  const columns = useMemo<ColumnDef<Schedule>[]>(
    () => [
      {
        accessorKey: 'title',
        header: t('scheduler.columns.schedule'),
        cell: ({ row }) => (
          <div className='min-w-0'>
            <p className='font-medium'>{scheduleTitle(row.original, t)}</p>
            <p className='mt-1 text-xs text-muted-foreground'>
              {scheduleDescription(row.original, t)}
            </p>
          </div>
        ),
      },
      {
        id: 'enabled',
        header: t('scheduler.columns.enabled'),
        cell: ({ row }) => {
          const schedule = row.original;
          return (
            <Switch
              checked={schedule.enabled}
              disabled={
                savingId === schedule.id ||
                schedule.lifecycleState === 'inactive'
              }
              aria-label={t(
                schedule.enabled
                  ? 'scheduler.disableNamed'
                  : 'scheduler.enableNamed',
                { name: scheduleTitle(schedule, t) },
              )}
              onCheckedChange={(checked) => {
                void toggle(schedule, checked);
              }}
            />
          );
        },
      },
      {
        accessorKey: 'scheduleStatus',
        header: t('scheduler.columns.status'),
        cell: ({ row }) => (
          <StatusBadge
            tone={
              row.original.scheduleStatus === 'active' ? 'success' : 'neutral'
            }
            size='sm'
          >
            {t(`scheduler.scheduleStatus.${row.original.scheduleStatus}`)}
          </StatusBadge>
        ),
      },
      {
        accessorKey: 'nextRunAt',
        header: t('scheduler.columns.nextRun'),
        cell: ({ row }) =>
          formatDateTime(row.original.nextRunAt, i18n.language),
      },
      {
        accessorKey: 'lastRunAt',
        header: t('scheduler.columns.lastRun'),
        cell: ({ row }) =>
          formatDateTime(row.original.lastRunAt, i18n.language),
      },
      {
        id: 'executions',
        header: t('scheduler.columns.executions'),
        cell: ({ row }) =>
          t('scheduler.executionCounts', {
            completed: row.original.completedCount,
            total: row.original.runCount,
          }),
      },
      {
        id: 'actions',
        header: t('scheduler.columns.actions'),
        cell: ({ row }) => (
          <Button
            variant='outline'
            size='sm'
            nativeButton={false}
            render={
              <Link to={encodeURIComponent(row.original.id)}>
                <HistoryIcon />
                {t('scheduler.viewHistory')}
              </Link>
            }
          />
        ),
      },
    ],
    [i18n.language, savingId, t, toggle],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('scheduler.title')}
        description={t('scheduler.description')}
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
      <DataTable
        columns={columns}
        data={schedules}
        getRowId={(schedule) => schedule.id}
        loading={loading}
        pagination={false}
        emptyMessage={
          <div className='flex flex-col items-center gap-2 py-8 text-muted-foreground'>
            <CalendarClockIcon className='size-5' />
            <span>{t('scheduler.empty')}</span>
          </div>
        }
      />
      {/* A schedule's execution history is a page of its own, laid over this list by the child route. */}
      <Outlet />
    </PageContainer>
  );
}
