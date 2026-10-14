import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircleIcon } from 'lucide-react';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useParams } from 'react-router';

import { DataTable } from '#components/data-table';
import { DataTableColumnHeader } from '#components/data-table/column-header';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';

import { ScheduleEnabledAction } from './actions.js';
import {
  OccurrenceStatusBadge,
  ScheduleEnabledBadge,
  TargetStateBadge,
} from './status.js';
import type { OccurrenceList, Schedule, ScheduleOccurrence } from './types.js';

const PAGE_SIZE = 20;

/** The target's own `{ updatedCount }` result, in words; anything else is shown as its JSON. */
function resultText(
  summary: Record<string, unknown> | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!summary) return '—';
  if (typeof summary.updatedCount === 'number') {
    return t('scheduler.occurrences.updatedCount', {
      count: summary.updatedCount,
    });
  }
  return JSON.stringify(summary);
}

function DetailItem({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactElement | string;
}): ReactElement {
  return (
    <div className='space-y-1'>
      <dt className='text-xs font-medium text-muted-foreground'>{label}</dt>
      <dd className='text-sm'>{children}</dd>
    </div>
  );
}

/**
 * One Schedule's execution history: the plugin's occurrence feed, newest first. It is a covering child page, so it
 * keeps the list beneath it and returns there with the back button.
 */
export default function SchedulerDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const { scheduleId = '' } = useParams();

  const [scheduleResult, setScheduleResult] = useState<{
    readonly key: string;
    readonly data?: Schedule;
    readonly error?: unknown;
  }>();
  const [scheduleReload, setScheduleReload] = useState(0);
  const scheduleKey = `${scheduleId}:${scheduleReload}`;

  useEffect(() => {
    const controller = new AbortController();
    const key = `${scheduleId}:${scheduleReload}`;
    api
      .request<{ readonly data: Schedule }>({
        path: `scheduler/schedules/${encodeURIComponent(scheduleId)}`,
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setScheduleResult({ key, data });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setScheduleResult({ key, error });
        },
      );
    return () => controller.abort();
  }, [api, scheduleId, scheduleReload]);

  // A result from an earlier schedule (or an earlier reload) is not the one on screen yet: show loading instead.
  const scheduleLoading = scheduleResult?.key !== scheduleKey;
  const schedule = scheduleLoading ? undefined : scheduleResult?.data;
  const scheduleError = scheduleLoading ? undefined : scheduleResult?.error;

  // Enable/disable answers with the updated plan, so the header reflects it without reloading the page.
  const handleScheduleChanged = useCallback((updated: Schedule) => {
    setScheduleResult((previous) =>
      previous?.data?.id === updated.id
        ? { ...previous, data: updated }
        : previous,
    );
  }, []);

  // The occurrence feed pages by cursor; keep the pages already loaded and the token for the next one. State is
  // keyed by the schedule so a switch to another plan reads as "not loaded yet" rather than the previous plan's rows.
  const [occurrencePages, setOccurrencePages] = useState<{
    readonly key: string;
    readonly items: ScheduleOccurrence[];
    readonly nextPageToken?: string;
    readonly error?: unknown;
  }>();
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const key = scheduleId;
    api
      .request<OccurrenceList>({
        path: `scheduler/schedules/${encodeURIComponent(scheduleId)}/occurrences`,
        query: { pageSize: PAGE_SIZE },
        signal: controller.signal,
      })
      .then(
        ({ data, meta }) => {
          if (!controller.signal.aborted) {
            setOccurrencePages({
              key,
              items: data,
              nextPageToken: meta.nextPageToken,
            });
          }
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setOccurrencePages({ key, items: [], error });
          }
        },
      );
    return () => controller.abort();
  }, [api, scheduleId]);

  const occurrencesLoaded = occurrencePages?.key === scheduleId;
  const occurrences = occurrencesLoaded ? occurrencePages.items : [];
  const nextPageToken = occurrencesLoaded
    ? occurrencePages.nextPageToken
    : undefined;
  const occurrenceError = occurrencesLoaded ? occurrencePages.error : undefined;

  async function loadMore(): Promise<void> {
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data, meta } = await api.request<OccurrenceList>({
        path: `scheduler/schedules/${encodeURIComponent(scheduleId)}/occurrences`,
        query: { pageSize: PAGE_SIZE, pageToken: nextPageToken },
      });
      setOccurrencePages((current) =>
        current && current.key === scheduleId
          ? {
              ...current,
              items: [...current.items, ...data],
              nextPageToken: meta.nextPageToken,
            }
          : { key: scheduleId, items: data, nextPageToken: meta.nextPageToken },
      );
    } catch (error) {
      setOccurrencePages((current) =>
        current && current.key === scheduleId
          ? { ...current, error }
          : { key: scheduleId, items: [], error },
      );
    } finally {
      setLoadingMore(false);
    }
  }

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }),
    [locale],
  );

  const columns = useMemo<ColumnDef<ScheduleOccurrence>[]>(
    () => [
      {
        accessorKey: 'status',
        enableHiding: false,
        header: t('scheduler.occurrences.fields.status'),
        cell: ({ row }) => (
          <OccurrenceStatusBadge status={row.original.status} />
        ),
      },
      {
        accessorKey: 'startedAt',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('scheduler.occurrences.fields.startedAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {dateFormat.format(new Date(row.original.startedAt))}
          </span>
        ),
      },
      {
        accessorKey: 'finishedAt',
        enableHiding: false,
        header: t('scheduler.occurrences.fields.finishedAt'),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {row.original.finishedAt
              ? dateFormat.format(new Date(row.original.finishedAt))
              : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'executionCount',
        enableHiding: false,
        header: t('scheduler.occurrences.fields.executionCount'),
        cell: ({ row }) => <span>{row.original.executionCount}</span>,
      },
      {
        id: 'result',
        enableHiding: false,
        header: t('scheduler.occurrences.fields.result'),
        cell: ({ row }) => (
          <span className='text-muted-foreground'>
            {resultText(row.original.resultSummary, t)}
          </span>
        ),
      },
    ],
    [dateFormat, t],
  );

  const info = schedule
    ? [
        { label: t('scheduler.fields.cron'), value: schedule.cron },
        { label: t('scheduler.fields.timezone'), value: schedule.timezone },
        { label: t('scheduler.fields.targetType'), value: schedule.targetType },
        {
          label: t('scheduler.fields.nextRunAt'),
          value: schedule.nextRunAt
            ? dateFormat.format(new Date(schedule.nextRunAt))
            : '—',
        },
        {
          label: t('scheduler.fields.lastRunAt'),
          value: schedule.lastRunAt
            ? dateFormat.format(new Date(schedule.lastRunAt))
            : '—',
        },
        {
          label: t('scheduler.fields.runCount'),
          value: String(schedule.runCount),
        },
        {
          label: t('scheduler.fields.completedCount'),
          value: String(schedule.completedCount),
        },
      ]
    : [];

  return (
    <RouteChildPage>
      <PageContainer>
        <PageHeader
          title={schedule?.title ?? t('scheduler.detail.title')}
          description={
            schedule?.description ?? t('scheduler.detail.description')
          }
          actions={
            <div className='flex items-center gap-2'>
              {schedule ? (
                <>
                  <ScheduleEnabledBadge enabled={schedule.enabled} />
                  <TargetStateBadge state={schedule.targetState} />
                  <ScheduleEnabledAction
                    schedule={schedule}
                    onChanged={handleScheduleChanged}
                  />
                </>
              ) : null}
              {scheduleError ? (
                <Button
                  variant='outline'
                  onClick={() => setScheduleReload((count) => count + 1)}
                >
                  {t('status.retry')}
                </Button>
              ) : null}
            </div>
          }
        />

        {scheduleError ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertTitle>{t('scheduler.error.title')}</AlertTitle>
            <AlertDescription>
              {scheduleError instanceof ApiClientError &&
              scheduleError.status === 404
                ? t('scheduler.detail.notFound')
                : t('scheduler.error.requestFailed')}
            </AlertDescription>
          </Alert>
        ) : (
          <dl className='grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4'>
            {info.map((item) => (
              <DetailItem key={item.label} label={item.label}>
                {item.value}
              </DetailItem>
            ))}
          </dl>
        )}

        <section className='space-y-3'>
          <h2 className='font-heading text-lg font-semibold'>
            {t('scheduler.occurrences.title')}
          </h2>
          {occurrenceError ? (
            <Alert variant='destructive'>
              <AlertCircleIcon />
              <AlertDescription>
                {t('scheduler.occurrences.error')}
              </AlertDescription>
            </Alert>
          ) : occurrences.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('scheduler.occurrences.empty')}
            </p>
          ) : (
            <>
              <DataTable
                columns={columns}
                data={occurrences}
                getRowId={(row) => row.id}
                pagination={false}
                showSelectedCount={false}
              />
              {nextPageToken ? (
                <Button
                  variant='outline'
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? <Spinner data-icon='inline-start' /> : null}
                  {t('scheduler.occurrences.loadMore')}
                </Button>
              ) : null}
            </>
          )}
        </section>
      </PageContainer>
    </RouteChildPage>
  );
}
