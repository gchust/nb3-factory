import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  CalendarClockIcon,
  CircleAlertIcon,
  HistoryIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

type PageState = 'loading' | 'ready' | 'error';
type RecordsState = 'loading' | 'ready' | 'error';

interface Schedule {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly scheduleStatus: 'active' | 'paused';
  readonly targetState: 'ready' | 'disabled' | 'missing' | 'invalid';
  readonly runCount: number;
  readonly completedCount: number;
  readonly nextRunAt?: string;
  readonly lastRunAt?: string;
}

interface Occurrence {
  readonly id: string;
  readonly status: string;
  readonly reason?: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly resultSummary?: Readonly<Record<string, unknown>>;
}

function formatInstant(iso: string | undefined, language: string): string {
  if (!iso) {
    return '—';
  }
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(iso));
}

function occurrenceTone(
  status: string,
): 'neutral' | 'info' | 'warning' | 'success' {
  switch (status) {
    case 'succeeded':
      return 'success';
    case 'failed':
    case 'timed_out':
      return 'warning';
    case 'waiting':
    case 'running':
      return 'info';
    default:
      return 'neutral';
  }
}

/** `/scheduler`: the Scheduler plugin's schedules with their execution history. */
export default function SchedulerPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [schedules, setSchedules] = useState<readonly Schedule[]>([]);
  const [pageState, setPageState] = useState<PageState>('loading');
  const [reloading, setReloading] = useState(false);
  const [pendingId, setPendingId] = useState<string>();
  const [recordsFor, setRecordsFor] = useState<Schedule>();
  const [occurrences, setOccurrences] = useState<readonly Occurrence[]>([]);
  const [recordsState, setRecordsState] = useState<RecordsState>('ready');

  const load = useCallback(
    async (silent = false): Promise<boolean> => {
      setReloading(true);
      if (!silent) {
        setPageState('loading');
      }
      try {
        const response = await api.request<{ data: readonly Schedule[] }>({
          path: '/scheduler/schedules',
        });
        setSchedules(response.data);
        setPageState('ready');
        return true;
      } catch {
        if (!silent) {
          setPageState('error');
        }
        return false;
      } finally {
        setReloading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    let cancelled = false;
    api
      .request<{ data: readonly Schedule[] }>({ path: '/scheduler/schedules' })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setSchedules(response.data);
        setPageState('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setPageState('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api]);

  const loadOccurrences = useCallback(
    async (schedule: Schedule): Promise<void> => {
      setOccurrences([]);
      setRecordsState('loading');
      try {
        const response = await api.request<{ data: readonly Occurrence[] }>({
          path: `/scheduler/schedules/${schedule.id}/occurrences`,
          query: { pageSize: 20 },
        });
        setOccurrences(response.data);
        setRecordsState('ready');
      } catch {
        setRecordsState('error');
      }
    },
    [api],
  );

  async function toggleSchedule(schedule: Schedule): Promise<void> {
    if (pendingId) {
      return;
    }
    setPendingId(schedule.id);
    try {
      const response = await api.request<{ data: Schedule }>({
        method: 'POST',
        path: `/scheduler/schedules/${schedule.id}/${
          schedule.enabled ? 'disable' : 'enable'
        }`,
      });
      setSchedules((current) =>
        current.map((item) =>
          item.id === response.data.id ? response.data : item,
        ),
      );
    } catch {
      toaster.show({ type: 'error', title: t('scheduler.toggleFailed') });
    } finally {
      setPendingId(undefined);
    }
  }

  function openRecords(schedule: Schedule): void {
    setRecordsFor(schedule);
    void loadOccurrences(schedule);
  }

  const title = t('scheduler.title');

  return (
    <PageContainer className='mx-auto max-w-6xl'>
      <PageHeader
        title={title}
        description={t('scheduler.description')}
        actions={
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              void load(true);
            }}
            disabled={reloading}
          >
            {reloading ? (
              <Spinner data-icon='inline-start' />
            ) : (
              <RefreshCwIcon data-icon='inline-start' />
            )}
            {t('scheduler.refresh')}
          </Button>
        }
      />

      {pageState === 'loading' ? (
        <div
          className='flex flex-col gap-4 rounded-xl border border-border bg-card p-4'
          aria-busy='true'
          aria-label={t('scheduler.loading')}
        >
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className='flex items-center gap-3'>
              <Skeleton className='size-8 shrink-0 rounded-full' />
              <div className='flex min-w-0 flex-1 flex-col gap-2'>
                <Skeleton className='h-4 w-1/3' />
                <Skeleton className='h-3 w-1/5' />
              </div>
              <Skeleton className='h-6 w-16 shrink-0 rounded-full' />
            </div>
          ))}
        </div>
      ) : null}

      {pageState === 'error' ? (
        <Alert variant='destructive'>
          <CircleAlertIcon aria-hidden='true' />
          <AlertTitle>{t('scheduler.loadError.title')}</AlertTitle>
          <AlertDescription>
            {t('scheduler.loadError.description')}
          </AlertDescription>
          <AlertAction>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => {
                void load();
              }}
            >
              <RefreshCwIcon data-icon='inline-start' />
              {t('status.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {pageState === 'ready' ? (
        schedules.length === 0 ? (
          <Empty className='border border-dashed border-border'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <CalendarClockIcon aria-hidden='true' />
              </EmptyMedia>
              <EmptyTitle>{t('scheduler.empty.title')}</EmptyTitle>
              <EmptyDescription>
                {t('scheduler.empty.description')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className='overflow-hidden rounded-xl border border-border bg-card'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('scheduler.columns.title')}</TableHead>
                  <TableHead className='w-56'>
                    {t('scheduler.columns.schedule')}
                  </TableHead>
                  <TableHead className='w-32'>
                    {t('scheduler.columns.status')}
                  </TableHead>
                  <TableHead className='w-48'>
                    {t('scheduler.columns.nextRun')}
                  </TableHead>
                  <TableHead className='w-64 text-right'>
                    {t('scheduler.columns.actions')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => (
                  <TableRow key={schedule.id}>
                    <TableCell className='max-w-0 whitespace-normal'>
                      <p className='font-medium break-words'>
                        {schedule.title}
                      </p>
                      {schedule.description ? (
                        <p className='mt-1 text-sm break-words text-muted-foreground'>
                          {schedule.description}
                        </p>
                      ) : null}
                      <p className='mt-1 text-xs break-all text-muted-foreground'>
                        {schedule.key}
                      </p>
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      <code className='text-xs'>{schedule.cron}</code>
                      <p className='mt-1 text-xs'>{schedule.timezone}</p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={schedule.enabled ? 'success' : 'neutral'}
                      >
                        {schedule.enabled
                          ? t('scheduler.status.enabled')
                          : t('scheduler.status.disabled')}
                      </StatusBadge>
                      <p className='mt-1 text-xs text-muted-foreground'>
                        {t('scheduler.runCount', {
                          count: schedule.runCount,
                          completed: schedule.completedCount,
                        })}
                      </p>
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {formatInstant(schedule.nextRunAt, i18n.language)}
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='flex flex-wrap justify-end gap-2'>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => openRecords(schedule)}
                        >
                          <HistoryIcon data-icon='inline-start' />
                          {t('scheduler.records.action')}
                        </Button>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          disabled={pendingId === schedule.id}
                          onClick={() => {
                            void toggleSchedule(schedule);
                          }}
                        >
                          {pendingId === schedule.id ? (
                            <Spinner data-icon='inline-start' />
                          ) : null}
                          {schedule.enabled
                            ? t('scheduler.actions.disable')
                            : t('scheduler.actions.enable')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : null}

      <Dialog
        open={recordsFor !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setRecordsFor(undefined);
          }
        }}
      >
        <DialogContent className='sm:max-w-3xl'>
          <DialogHeader>
            <DialogTitle>{t('scheduler.records.title')}</DialogTitle>
            <DialogDescription>
              {recordsFor
                ? t('scheduler.records.description', {
                    title: recordsFor.title,
                  })
                : null}
            </DialogDescription>
          </DialogHeader>

          {recordsState === 'loading' ? (
            <div
              className='flex flex-col gap-3'
              aria-busy='true'
              aria-label={t('scheduler.records.loading')}
            >
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className='h-8 w-full' />
              ))}
            </div>
          ) : null}

          {recordsState === 'error' ? (
            <Alert variant='destructive'>
              <CircleAlertIcon aria-hidden='true' />
              <AlertTitle>{t('scheduler.records.error.title')}</AlertTitle>
              <AlertDescription>
                {t('scheduler.records.error.description')}
              </AlertDescription>
              <AlertAction>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    if (recordsFor) {
                      void loadOccurrences(recordsFor);
                    }
                  }}
                >
                  <RefreshCwIcon data-icon='inline-start' />
                  {t('status.retry')}
                </Button>
              </AlertAction>
            </Alert>
          ) : null}

          {recordsState === 'ready' ? (
            occurrences.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('scheduler.records.empty')}
              </p>
            ) : (
              <div className='overflow-hidden rounded-xl border border-border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t('scheduler.records.columns.started')}
                      </TableHead>
                      <TableHead className='w-32'>
                        {t('scheduler.records.columns.status')}
                      </TableHead>
                      <TableHead className='w-48'>
                        {t('scheduler.records.columns.finished')}
                      </TableHead>
                      <TableHead>
                        {t('scheduler.records.columns.result')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {occurrences.map((occurrence) => (
                      <TableRow key={occurrence.id}>
                        <TableCell className='text-muted-foreground'>
                          <time dateTime={occurrence.startedAt}>
                            {formatInstant(occurrence.startedAt, i18n.language)}
                          </time>
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={occurrenceTone(occurrence.status)}>
                            {t(
                              `scheduler.occurrenceStatus.${occurrence.status}`,
                              { defaultValue: occurrence.status },
                            )}
                          </StatusBadge>
                          {occurrence.reason ? (
                            <p className='mt-1 text-xs text-muted-foreground'>
                              {occurrence.reason}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className='text-muted-foreground'>
                          {formatInstant(occurrence.finishedAt, i18n.language)}
                        </TableCell>
                        <TableCell className='text-muted-foreground'>
                          {occurrence.resultSummary
                            ? JSON.stringify(occurrence.resultSummary)
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
