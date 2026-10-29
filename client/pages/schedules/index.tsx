import { useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import { cn } from 'cn';

interface Schedule {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly lifecycleState: 'active' | 'inactive';
  readonly inactiveReason?: string;
  readonly runCount: number;
  readonly completedCount: number;
  readonly nextRunAt?: string;
  readonly lastRunAt?: string;
  readonly scheduleStatus: 'active' | 'paused';
  readonly targetState: 'ready' | 'disabled' | 'missing' | 'invalid';
  readonly targetSummary: {
    readonly targetLabel: string;
    readonly description?: string;
  };
}

interface Occurrence {
  readonly id: string;
  readonly status:
    | 'pending'
    | 'running'
    | 'waiting'
    | 'succeeded'
    | 'failed'
    | 'skipped'
    | 'cancelled'
    | 'timed_out'
    | 'triggered';
  readonly reason?: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly resultSummary?: Readonly<Record<string, unknown>>;
}

const occurrenceTones: Record<
  Occurrence['status'],
  'neutral' | 'info' | 'warning' | 'success'
> = {
  pending: 'info',
  running: 'info',
  waiting: 'info',
  triggered: 'info',
  succeeded: 'success',
  skipped: 'neutral',
  failed: 'warning',
  cancelled: 'warning',
  timed_out: 'warning',
};

/**
 * Route `/schedules`: this application's view of the Scheduler plugin's schedules.
 *
 * The plugin contributes no page of its own, so an application that lists schedules builds one on `GET
 * /api/scheduler/schedules`. This page shows the schedule defined in `server/providers/todos.ts` — its name, whether
 * it is enabled, when it next runs, and the execution records the scheduler keeps — and lets an administrator switch
 * it on or off. There is deliberately no "run now": the only way a firing happens is the schedule itself, so what a
 * reviewer sees in the history is a real scheduling run and not a direct write.
 */
export default function SchedulesPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const client = useApiClient();
  const [schedules, setSchedules] = useState<readonly Schedule[]>();
  const [failed, setFailed] = useState(false);
  const [pendingId, setPendingId] = useState<string>();
  const [expandedId, setExpandedId] = useState<string>();
  const [occurrences, setOccurrences] = useState<readonly Occurrence[]>();
  const [occurrencesFailed, setOccurrencesFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    client
      .request<{ data: Schedule[]; meta: { total: number } }>({
        path: 'scheduler/schedules',
        query: { pageSize: 50 },
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) {
            setSchedules(data);
            setFailed(false);
          }
        },
        () => {
          if (!controller.signal.aborted) setFailed(true);
        },
      );
    return () => controller.abort();
  }, [client, reloadToken]);

  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

  function formatDate(value?: string): string {
    return value ? dateFormat.format(new Date(value)) : '—';
  }

  // `resultSummary` is open-ended JSON, so read the one field the target reports without trusting its type.
  function formatResult(occurrence: Occurrence): string {
    if (occurrence.status !== 'succeeded') {
      return occurrence.reason ?? t('schedules.occurrences.noResult');
    }
    const marked = occurrence.resultSummary?.marked;
    return t('schedules.occurrences.result', {
      value: typeof marked === 'number' ? String(marked) : '—',
    });
  }

  async function toggleEnabled(schedule: Schedule): Promise<void> {
    setPendingId(schedule.id);
    try {
      const { data } = await client.request<{ data: Schedule }>({
        path: `scheduler/schedules/${schedule.id}/${
          schedule.enabled ? 'disable' : 'enable'
        }`,
        method: 'POST',
      });
      setSchedules((current) =>
        current?.map((item) => (item.id === data.id ? data : item)),
      );
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setPendingId(undefined);
    }
  }

  async function toggleOccurrences(schedule: Schedule): Promise<void> {
    if (expandedId === schedule.id) {
      setExpandedId(undefined);
      return;
    }

    setExpandedId(schedule.id);
    setOccurrences(undefined);
    setOccurrencesFailed(false);
    try {
      const { data } = await client.request<{ data: Occurrence[] }>({
        path: `scheduler/schedules/${schedule.id}/occurrences`,
        query: { pageSize: 10 },
      });
      setOccurrences(data);
    } catch {
      setOccurrencesFailed(true);
    }
  }

  let content: ReactElement;
  if (!schedules && failed) {
    content = (
      <div className='flex items-center gap-3'>
        <p role='alert' className='text-sm text-destructive'>
          {t('schedules.error.failed')}
        </p>
        <Button
          variant='outline'
          size='sm'
          onClick={() => setReloadToken((value) => value + 1)}
        >
          {t('status.retry')}
        </Button>
      </div>
    );
  } else if (!schedules) {
    content = (
      <p role='status' className='text-sm text-muted-foreground'>
        {t('status.loading')}
      </p>
    );
  } else if (schedules.length === 0) {
    content = (
      <p className='text-sm text-muted-foreground'>{t('schedules.empty')}</p>
    );
  } else {
    content = (
      <div className='space-y-4'>
        {failed ? (
          <p role='alert' className='text-sm text-destructive'>
            {t('schedules.error.failed')}
          </p>
        ) : null}
        {schedules.map((schedule) => (
          <section
            key={schedule.id}
            className='rounded-xl p-4 ring-1 ring-foreground/10'
          >
            <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h2 className='font-heading text-lg font-medium'>
                    {schedule.title}
                  </h2>
                  <StatusBadge
                    tone={
                      schedule.enabled && schedule.lifecycleState === 'active'
                        ? 'success'
                        : 'neutral'
                    }
                  >
                    {schedule.enabled
                      ? t('schedules.status.enabled')
                      : t('schedules.status.disabled')}
                  </StatusBadge>
                  {schedule.targetState !== 'ready' ? (
                    <StatusBadge tone='warning'>
                      {t(`schedules.targetState.${schedule.targetState}`)}
                    </StatusBadge>
                  ) : null}
                </div>
                {schedule.description ? (
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {schedule.description}
                  </p>
                ) : null}
                <dl className='mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2'>
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('schedules.field.cron')}
                    </dt>
                    <dd className='font-mono'>
                      {schedule.cron} · {schedule.timezone}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('schedules.field.key')}
                    </dt>
                    <dd className='font-mono'>{schedule.key}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('schedules.field.nextRunAt')}
                    </dt>
                    <dd>{formatDate(schedule.nextRunAt)}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('schedules.field.lastRunAt')}
                    </dt>
                    <dd>{formatDate(schedule.lastRunAt)}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('schedules.field.runCount')}
                    </dt>
                    <dd>
                      {t('schedules.field.runCountValue', {
                        runs: schedule.runCount,
                        succeeded: schedule.completedCount,
                      })}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className='flex shrink-0 items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => void toggleOccurrences(schedule)}
                >
                  {expandedId === schedule.id
                    ? t('schedules.action.hideOccurrences')
                    : t('schedules.action.showOccurrences')}
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={pendingId === schedule.id}
                  onClick={() => void toggleEnabled(schedule)}
                >
                  {schedule.enabled
                    ? t('schedules.action.disable')
                    : t('schedules.action.enable')}
                </Button>
              </div>
            </div>
            {expandedId === schedule.id ? (
              <div className='mt-4 border-t border-border pt-4'>
                <h3 className='text-sm font-medium'>
                  {t('schedules.occurrences.title')}
                </h3>
                {occurrencesFailed ? (
                  <p role='alert' className='mt-2 text-sm text-destructive'>
                    {t('schedules.error.occurrencesFailed')}
                  </p>
                ) : !occurrences ? (
                  <p
                    role='status'
                    className='mt-2 text-sm text-muted-foreground'
                  >
                    {t('status.loading')}
                  </p>
                ) : occurrences.length === 0 ? (
                  <p className='mt-2 text-sm text-muted-foreground'>
                    {t('schedules.occurrences.empty')}
                  </p>
                ) : (
                  <ul className='mt-2 divide-y divide-border'>
                    {occurrences.map((occurrence) => (
                      <li
                        key={occurrence.id}
                        className='flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between'
                      >
                        <div className='flex items-center gap-2'>
                          <StatusBadge
                            tone={occurrenceTones[occurrence.status]}
                          >
                            {t(
                              `schedules.occurrenceStatus.${occurrence.status}`,
                            )}
                          </StatusBadge>
                          <span className='text-sm text-muted-foreground'>
                            {formatDate(occurrence.startedAt)}
                          </span>
                        </div>
                        <span
                          className={cn(
                            'text-sm',
                            occurrence.status !== 'succeeded' &&
                              'text-muted-foreground',
                          )}
                        >
                          {formatResult(occurrence)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </section>
        ))}
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('schedules.title')}
        description={t('schedules.description')}
      />
      {content}
    </PageContainer>
  );
}
