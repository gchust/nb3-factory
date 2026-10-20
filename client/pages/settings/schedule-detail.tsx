import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import {
  ArrowLeftIcon,
  Clock3Icon,
  HistoryIcon,
  RefreshCwIcon,
} from 'lucide-react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';

import { useSettingsData } from './hooks.js';
import type {
  OccurrenceList,
  ScheduleDetail,
  ScheduleOccurrence,
  ScheduleOccurrenceStatus,
} from './schedules-types.js';
import { SettingsError, SettingsLoading } from './shared.js';

const toneFor = (
  status: ScheduleOccurrenceStatus,
): 'success' | 'warning' | 'info' | 'neutral' => {
  switch (status) {
    case 'succeeded':
      return 'success';
    case 'failed':
    case 'timed_out':
      return 'warning';
    case 'pending':
    case 'running':
    case 'waiting':
      return 'info';
    default:
      return 'neutral';
  }
};

function formatDate(
  value: string | undefined,
  locale: string,
  empty: string,
): string {
  if (!value) return empty;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? empty
    : new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(date);
}

/** One firing's result, rendered read-only. The summary is scheduler output, never application HTML. */
function ResultSummary({
  occurrence,
  empty,
}: {
  readonly occurrence: ScheduleOccurrence;
  readonly empty: string;
}): ReactElement {
  if (!occurrence.resultSummary) {
    return <span className='text-xs text-muted-foreground'>{empty}</span>;
  }
  return (
    <pre className='mt-2 overflow-x-auto rounded-md bg-muted/40 p-2 text-xs whitespace-pre-wrap break-words text-muted-foreground'>
      {JSON.stringify(occurrence.resultSummary, null, 2)}
    </pre>
  );
}

export default function ScheduleDetailPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const { scheduleId = '' } = useParams();
  const location = useLocation();
  const encoded = encodeURIComponent(scheduleId);
  const scheduleRequest = useSettingsData<ScheduleDetail>(
    `scheduler/schedules/${encoded}`,
  );
  const [occurrenceLimit, setOccurrenceLimit] = useState(20);
  const occurrencesRequest = useSettingsData<OccurrenceList>(
    `scheduler/schedules/${encoded}/occurrences?pageSize=${occurrenceLimit}`,
  );
  const schedule = scheduleRequest.data?.data;
  const occurrences = occurrencesRequest.data?.data ?? [];
  const empty = t('todos.schedules.never');
  const loading =
    (scheduleRequest.loading && !scheduleRequest.data) ||
    (occurrencesRequest.loading && !occurrencesRequest.data);

  return (
    <PageContainer>
      <div>
        <Button
          variant='ghost'
          size='sm'
          nativeButton={false}
          render={
            <Link
              to={{
                pathname: '/settings/scheduled-tasks',
                search: location.search,
              }}
            />
          }
        >
          <ArrowLeftIcon />
          {t('todos.schedules.back')}
        </Button>
      </div>
      <PageHeader
        title={
          schedule
            ? t(schedule.title as Parameters<typeof t>[0])
            : t('todos.schedules.detailTitle')
        }
        description={
          schedule?.description
            ? t(schedule.description as Parameters<typeof t>[0])
            : t('todos.schedules.detailDescription')
        }
        actions={
          <Button
            variant='outline'
            disabled={loading}
            onClick={() => {
              scheduleRequest.reload();
              occurrencesRequest.reload();
            }}
          >
            <RefreshCwIcon />
            {t('todos.schedules.refresh')}
          </Button>
        }
      />
      <SettingsError
        error={scheduleRequest.error}
        retry={scheduleRequest.reload}
      />
      <SettingsError
        error={occurrencesRequest.error}
        retry={occurrencesRequest.reload}
      />
      {loading ? (
        <SettingsLoading />
      ) : (
        !scheduleRequest.error &&
        schedule && (
          <div className='flex flex-col gap-6'>
            <section className='rounded-xl border bg-card p-4'>
              <div className='flex flex-wrap items-center gap-2'>
                <Clock3Icon className='size-4 text-primary' />
                <h2 className='font-medium'>{t('todos.schedules.overview')}</h2>
                <StatusBadge
                  size='sm'
                  tone={
                    schedule.enabled && schedule.lifecycleState === 'active'
                      ? 'success'
                      : 'neutral'
                  }
                >
                  {t(
                    schedule.enabled && schedule.lifecycleState === 'active'
                      ? 'todos.schedules.enabled'
                      : 'todos.schedules.disabled',
                  )}
                </StatusBadge>
              </div>
              <dl className='mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3'>
                {[
                  ['todos.schedules.cron', schedule.cron],
                  ['todos.schedules.timezone', schedule.timezone],
                  [
                    'todos.schedules.nextRun',
                    formatDate(schedule.nextRunAt, i18n.language, empty),
                  ],
                  [
                    'todos.schedules.lastRun',
                    formatDate(schedule.lastRunAt, i18n.language, empty),
                  ],
                  ['todos.schedules.runCount', String(schedule.runCount)],
                  [
                    'todos.schedules.completedCount',
                    String(schedule.completedCount),
                  ],
                ].map(([key, value]) => (
                  <div key={key} className='flex flex-col gap-1'>
                    <dt className='text-xs text-muted-foreground'>{t(key)}</dt>
                    <dd className='break-words'>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className='flex flex-col gap-3'>
              <div className='flex items-center gap-2'>
                <HistoryIcon className='size-4 text-primary' />
                <h2 className='font-medium'>
                  {t('todos.schedules.executions')}
                </h2>
              </div>
              {occurrences.length ? (
                <div className='divide-y overflow-hidden rounded-xl border bg-card'>
                  {occurrences.map((occurrence) => (
                    <article key={occurrence.id} className='p-4'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <StatusBadge
                          size='sm'
                          tone={toneFor(occurrence.status)}
                        >
                          {t(
                            `todos.schedules.status.${occurrence.status}` as Parameters<
                              typeof t
                            >[0],
                          )}
                        </StatusBadge>
                        <span className='text-xs text-muted-foreground'>
                          {formatDate(
                            occurrence.startedAt,
                            i18n.language,
                            empty,
                          )}
                        </span>
                        {occurrence.executionCount > 1 && (
                          <span className='text-xs text-muted-foreground'>
                            {t('todos.schedules.attempts', {
                              count: occurrence.executionCount,
                            })}
                          </span>
                        )}
                      </div>
                      <div className='mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2'>
                        <p>
                          {t('todos.schedules.startedAt')}:{' '}
                          {formatDate(
                            occurrence.startedAt,
                            i18n.language,
                            empty,
                          )}
                        </p>
                        <p>
                          {t('todos.schedules.finishedAt')}:{' '}
                          {formatDate(
                            occurrence.finishedAt,
                            i18n.language,
                            empty,
                          )}
                        </p>
                        {occurrence.reason && (
                          <p className='sm:col-span-2'>
                            {t('todos.schedules.reason')}: {occurrence.reason}
                          </p>
                        )}
                      </div>
                      <div className='mt-2'>
                        <p className='text-xs font-medium'>
                          {t('todos.schedules.result')}
                        </p>
                        <ResultSummary
                          occurrence={occurrence}
                          empty={t('todos.schedules.noResult')}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty className='min-h-40 border border-dashed'>
                  <EmptyMedia variant='icon'>
                    <HistoryIcon />
                  </EmptyMedia>
                  <EmptyTitle>{t('todos.schedules.noExecutions')}</EmptyTitle>
                  <EmptyDescription>
                    {t('todos.schedules.noExecutionsHint')}
                  </EmptyDescription>
                </Empty>
              )}
              {occurrencesRequest.data?.meta.nextPageToken && (
                <Button
                  variant='outline'
                  disabled={occurrencesRequest.loading}
                  onClick={() => setOccurrenceLimit((value) => value + 20)}
                >
                  {t('todos.schedules.loadMore')}
                </Button>
              )}
            </section>
          </div>
        )
      )}
    </PageContainer>
  );
}
