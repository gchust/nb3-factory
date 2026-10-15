'use client';

import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import {
  AlertCircleIcon,
  CalendarClockIcon,
  RefreshCwIcon,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactElement,
} from 'react';

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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Skeleton } from '#components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { ScheduleActions } from './schedule-actions.js';
import { ScheduleRunsDialog } from './schedule-runs-dialog.js';
import type { Schedule, ScheduleList } from './types.js';

const PAGE_SIZE = 100;

/**
 * The application's own Scheduler page. The Scheduler plugin owns the schedules and their history but contributes no
 * page, so the application draws the list its administrators need: what each schedule does, whether it is on, when it
 * last and next runs, and its execution results.
 */
export default function SchedulerPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = String(reloadCount);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly schedules?: Schedule[];
    readonly error?: unknown;
  }>();
  const [runsFor, setRunsFor] = useState<Schedule>();

  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    api
      .request<ScheduleList>({
        path: 'scheduler/schedules',
        query: { pageSize: PAGE_SIZE },
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setResult({ key, schedules: data });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setResult((previous) => ({ ...previous, key, error }));
          }
        },
      );
    return () => controller.abort();
  }, [api, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const schedules = result?.schedules;

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }),
    [locale],
  );

  /** Keeps the changed row current without a round trip; the next refresh brings the plugin's own view. */
  function replaceSchedule(schedule: Schedule): void {
    setResult((previous) =>
      previous?.schedules
        ? {
            ...previous,
            schedules: previous.schedules.map((row) =>
              row.id === schedule.id ? schedule : row,
            ),
          }
        : previous,
    );
  }

  let content: ReactElement;
  if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('scheduler.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('scheduler.error.forbidden')
            : t('scheduler.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (schedules === undefined) {
    content = (
      <div className='space-y-2 rounded-lg border border-border p-4'>
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-8 w-full' />
        <span className='sr-only'>{t('status.loading')}</span>
      </div>
    );
  } else if (schedules.length === 0) {
    content = (
      <Empty className='min-h-48 border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <CalendarClockIcon />
          </EmptyMedia>
          <EmptyTitle>{t('scheduler.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('scheduler.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = (
      <div className='rounded-lg border border-border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('scheduler.columnTitle')}</TableHead>
              <TableHead>{t('scheduler.columnSchedule')}</TableHead>
              <TableHead>{t('scheduler.columnStatus')}</TableHead>
              <TableHead>{t('scheduler.columnNextRunAt')}</TableHead>
              <TableHead>{t('scheduler.columnLastRunAt')}</TableHead>
              <TableHead>{t('scheduler.columnRuns')}</TableHead>
              <TableHead>
                <span className='sr-only'>{t('scheduler.columnActions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.map((schedule) => (
              <TableRow key={schedule.id}>
                <TableCell>
                  <span className='font-medium'>{schedule.title}</span>
                  <span className='block text-xs text-muted-foreground'>
                    {schedule.key}
                  </span>
                </TableCell>
                <TableCell className='whitespace-nowrap text-muted-foreground'>
                  <code className='text-xs'>{schedule.cron}</code>
                  <span className='block text-xs'>{schedule.timezone}</span>
                </TableCell>
                <TableCell>
                  <div className='flex flex-wrap items-center gap-1.5'>
                    <StatusBadge
                      tone={schedule.enabled ? 'success' : 'neutral'}
                    >
                      {schedule.enabled
                        ? t('scheduler.enabled')
                        : t('scheduler.disabled')}
                    </StatusBadge>
                    {schedule.targetState !== 'ready' ? (
                      <StatusBadge tone='warning'>
                        {t(`scheduler.targetState.${schedule.targetState}`)}
                      </StatusBadge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className='whitespace-nowrap text-muted-foreground'>
                  {renderedRunTime(schedule.nextRunAt)}
                </TableCell>
                <TableCell className='whitespace-nowrap text-muted-foreground'>
                  {renderedRunTime(schedule.lastRunAt)}
                </TableCell>
                <TableCell className='whitespace-nowrap text-muted-foreground'>
                  {t('scheduler.runsCount', {
                    runCount: schedule.runCount,
                    completedCount: schedule.completedCount,
                  })}
                </TableCell>
                <TableCell className='text-right'>
                  <ScheduleActions
                    schedule={schedule}
                    onViewRuns={() => setRunsFor(schedule)}
                    onChanged={replaceSchedule}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  /** An inactive schedule is one the application no longer defines; say that instead of a time it will not reach. */
  function renderedRunTime(value: string | undefined): string {
    if (value) return dateFormat.format(new Date(value));
    return '—';
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('scheduler.title')}
        description={t('scheduler.description')}
        actions={
          <Button variant='outline' disabled={loading} onClick={reload}>
            <RefreshCwIcon />
            {t('scheduler.refresh')}
          </Button>
        }
      />
      {content}
      {runsFor ? (
        <ScheduleRunsDialog
          schedule={runsFor}
          onClose={() => setRunsFor(undefined)}
        />
      ) : null}
    </PageContainer>
  );
}
