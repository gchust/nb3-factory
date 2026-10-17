import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { RefreshCwIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { Loading } from '#components/loading';
import { RouteDrawer } from '#components/route-drawer';
import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#components/ui/empty';
import { Spinner } from '#components/ui/spinner';
import { useDateFormat } from '#hooks/use-date-format';

import { fetchOccurrences, fetchSchedule } from './api.js';
import { occurrenceTone } from './status.js';
import type { Occurrence, Schedule } from './types.js';

/**
 * The execution records of one Schedule, as a drawer over the schedules page.
 *
 * Every firing the Scheduler dispatched appears here with what it did; the page shows the records the Scheduler
 * kept, not a second bookkeeping of them.
 */
export default function ScheduleOccurrencesPage(): ReactElement {
  const { scheduleId = '' } = useParams<{ scheduleId: string }>();
  // Switching schedules remounts the body, so no result of the previous one survives.
  return <OccurrencesBody key={scheduleId} scheduleId={scheduleId} />;
}

function OccurrencesBody({
  scheduleId,
}: {
  readonly scheduleId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { formatDateTime } = useDateFormat();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = String(reloadCount);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly schedule?: Schedule;
    readonly occurrences?: readonly Occurrence[];
    readonly nextPageToken?: string;
    readonly error?: unknown;
  }>();
  // Pages appended from `nextPageToken`; a reload replaces them with the first page again.
  const [more, setMore] = useState<readonly Occurrence[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchSchedule(api, scheduleId, controller.signal),
      fetchOccurrences(api, scheduleId, undefined, controller.signal),
    ]).then(
      ([schedule, page]) => {
        if (controller.signal.aborted) return;
        setResult({
          key: String(reloadCount),
          schedule,
          occurrences: page.data,
          nextPageToken: page.meta.nextPageToken,
        });
        setMore([]);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key: String(reloadCount), error });
      },
    );
    return () => controller.abort();
  }, [api, scheduleId, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);
  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const occurrences = [...(result?.occurrences ?? []), ...more];

  const loadMore = async (): Promise<void> => {
    if (!result?.nextPageToken) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = await fetchOccurrences(
        api,
        scheduleId,
        result.nextPageToken,
      );
      setMore((current) => [...current, ...page.data]);
      setResult((current) =>
        current
          ? { ...current, nextPageToken: page.meta.nextPageToken }
          : current,
      );
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <RouteDrawer
      title={t('schedules.occurrences.title')}
      description={
        result?.schedule?.title ?? t('schedules.occurrences.subtitle')
      }
    >
      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-end'>
          <Button variant='ghost' size='sm' onClick={reload} disabled={loading}>
            {loading ? (
              <Spinner data-icon='inline-start' />
            ) : (
              <RefreshCwIcon data-icon='inline-start' />
            )}
            {t('schedules.occurrences.refresh')}
          </Button>
        </div>

        {error ? (
          <OccurrencesError error={error} onRetry={reload} retrying={loading} />
        ) : loading && result?.occurrences === undefined ? (
          <Loading
            className='py-16'
            label={t('schedules.occurrences.loading')}
          />
        ) : occurrences.length === 0 ? (
          <Empty className='min-h-40 border border-dashed p-6 md:p-6'>
            <EmptyHeader>
              <EmptyTitle>{t('schedules.occurrences.empty.title')}</EmptyTitle>
              <EmptyDescription>
                {t('schedules.occurrences.empty.description')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className='flex flex-col gap-2'>
            {occurrences.map((occurrence) => (
              <OccurrenceRow
                key={occurrence.id}
                occurrence={occurrence}
                formatDateTime={formatDateTime}
              />
            ))}
          </ul>
        )}

        {result?.nextPageToken ? (
          <div className='flex flex-col items-center gap-2'>
            <Button
              variant='outline'
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? <Spinner data-icon='inline-start' /> : null}
              {t('schedules.occurrences.loadMore')}
            </Button>
            {moreFailed ? (
              <p role='alert' className='text-sm text-destructive'>
                {t('schedules.occurrences.loadMoreFailed')}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </RouteDrawer>
  );
}

function OccurrenceRow({
  occurrence,
  formatDateTime,
}: {
  readonly occurrence: Occurrence;
  readonly formatDateTime: (value: string) => string;
}): ReactElement {
  const { t } = useTranslation();
  const expiredCount = readExpiredCount(occurrence.resultSummary);

  return (
    <li className='flex flex-col gap-2 rounded-lg border border-border bg-card p-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <StatusBadge tone={occurrenceTone(occurrence.status)}>
            {t(`schedules.occurrence.status.${occurrence.status}`)}
          </StatusBadge>
          {occurrence.executionCount > 1 ? (
            <span className='text-xs text-muted-foreground'>
              {t('schedules.occurrence.executionCount', {
                count: occurrence.executionCount,
              })}
            </span>
          ) : null}
        </div>
        <span className='text-xs text-muted-foreground'>
          {formatDateTime(occurrence.startedAt)}
        </span>
      </div>

      <dl className='flex flex-col gap-1 text-sm'>
        <div className='flex gap-1.5'>
          <dt className='text-muted-foreground'>
            {t('schedules.occurrence.startedAt')}
          </dt>
          <dd>{formatDateTime(occurrence.startedAt)}</dd>
        </div>
        <div className='flex gap-1.5'>
          <dt className='text-muted-foreground'>
            {t('schedules.occurrence.finishedAt')}
          </dt>
          <dd>
            {occurrence.finishedAt
              ? formatDateTime(occurrence.finishedAt)
              : t('schedules.occurrence.running')}
          </dd>
        </div>
        {expiredCount === undefined ? null : (
          <div className='flex gap-1.5'>
            <dt className='text-muted-foreground'>
              {t('schedules.occurrence.result')}
            </dt>
            <dd>
              {t('schedules.occurrence.expiredCount', { count: expiredCount })}
            </dd>
          </div>
        )}
      </dl>

      {occurrence.reason ? (
        <p className='font-mono text-xs text-muted-foreground'>
          {t('schedules.occurrence.reason', { reason: occurrence.reason })}
        </p>
      ) : null}
    </li>
  );
}

/** What the "check expired todos" target reports; other targets keep their own summary, which this page ignores. */
function readExpiredCount(
  summary: Readonly<Record<string, unknown>> | undefined,
): number | undefined {
  const value = summary?.['expiredCount'];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function OccurrencesError({
  error,
  onRetry,
  retrying,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly retrying: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const notFound = error instanceof ApiClientError && error.status === 404;
  const denied = error instanceof ApiClientError && error.status === 403;

  return (
    <div className='flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-6 text-center'>
      <p className='font-medium'>
        {notFound
          ? t('schedules.occurrences.error.notFound')
          : denied
            ? t('schedules.error.forbidden')
            : t('schedules.occurrences.error.title')}
      </p>
      <p className='max-w-sm text-sm text-muted-foreground'>
        {notFound
          ? t('schedules.occurrences.error.notFoundDescription')
          : denied
            ? t('schedules.error.forbiddenDescription')
            : t('schedules.occurrences.error.description')}
      </p>
      {notFound || denied ? null : (
        <Button variant='outline' onClick={onRetry} disabled={retrying}>
          {retrying ? <Spinner /> : null}
          {t('schedules.occurrences.error.retry')}
        </Button>
      )}
    </div>
  );
}
