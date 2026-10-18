import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

import { Loading } from '#components/loading';
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
  EmptyTitle,
} from '#components/ui/empty';
import { Spinner } from '#components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { listOccurrences, listSchedules, setScheduleEnabled } from './api.js';
import {
  TODO_EXPIRY_SCHEDULE_KEY,
  type OccurrenceStatus,
  type ScheduleListItem,
  type ScheduleOccurrence,
} from './types.js';

interface LoadedSchedules {
  readonly key: string;
  readonly schedules?: readonly ScheduleListItem[];
  readonly error?: unknown;
}

interface LoadedOccurrences {
  readonly key: string;
  readonly occurrences?: readonly ScheduleOccurrence[];
  readonly error?: unknown;
}

/**
 * The application's own Scheduler management page. The Scheduler plugin contributes no page, so this is where an
 * administrator sees the schedules the application defines, switches them on or off, and reads the execution record
 * of each firing. It triggers nothing directly: a firing is planned by the Scheduler and started when its cron says
 * so, and the occurrence table below is that record.
 */
export default function SchedulesPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [reloadCount, setReloadCount] = useState(0);
  const [schedulesResult, setSchedulesResult] = useState<LoadedSchedules>();
  const [selectedId, setSelectedId] = useState<string>();
  const [pendingId, setPendingId] = useState<string>();
  const [occurrencesResult, setOccurrencesResult] =
    useState<LoadedOccurrences>();

  const schedulesKey = String(reloadCount);

  useEffect(() => {
    const controller = new AbortController();
    const key = String(reloadCount);
    listSchedules(api, controller.signal).then(
      (schedules) => {
        if (!controller.signal.aborted) setSchedulesResult({ key, schedules });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setSchedulesResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const schedules =
    schedulesResult?.key === schedulesKey
      ? schedulesResult.schedules
      : undefined;

  // The selection is derived rather than pushed into state when the list arrives: the schedule the user last chose,
  // otherwise the expiry schedule this application defines, otherwise the first one.
  const selected =
    schedules?.find((item) => item.id === selectedId) ??
    schedules?.find((item) => item.key === TODO_EXPIRY_SCHEDULE_KEY) ??
    schedules?.[0];
  const activeId = selected?.id;
  const occurrencesKey = `${activeId ?? ''}:${reloadCount}`;

  useEffect(() => {
    if (!activeId) return;
    const controller = new AbortController();
    const key = `${activeId}:${reloadCount}`;
    listOccurrences(api, activeId, controller.signal).then(
      (occurrences) => {
        if (!controller.signal.aborted)
          setOccurrencesResult({ key, occurrences });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setOccurrencesResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [api, activeId, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  const toggleEnabled = useCallback(
    (schedule: ScheduleListItem): void => {
      const enabled = !schedule.enabled;
      setPendingId(schedule.id);
      setScheduleEnabled(api, schedule.id, enabled)
        .then(
          (updated) => {
            setSchedulesResult((current) =>
              current?.schedules
                ? {
                    ...current,
                    schedules: current.schedules.map((item) =>
                      item.id === updated.id ? updated : item,
                    ),
                  }
                : current,
            );
            toaster.show({
              type: 'success',
              title: t(
                enabled
                  ? 'schedules.toast.enabled'
                  : 'schedules.toast.disabled',
                { title: schedule.title },
              ),
            });
          },
          (error: unknown) => {
            toaster.show({
              type: 'error',
              title: t('schedules.toast.failed'),
              description: describeError(error) ?? t('schedules.error.unknown'),
            });
          },
        )
        .finally(() => setPendingId(undefined));
    },
    [api, t, toaster],
  );

  const occurrences =
    occurrencesResult?.key === occurrencesKey
      ? occurrencesResult.occurrences
      : undefined;

  return (
    <PageContainer>
      <PageHeader
        title={t('schedules.title')}
        description={t('schedules.description')}
        actions={
          <Button variant='outline' size='sm' onClick={reload}>
            {t('schedules.refresh')}
          </Button>
        }
      />

      {schedulesResult?.key !== schedulesKey ? (
        <Loading label={t('schedules.loading')} />
      ) : schedulesResult?.error ? (
        <RequestFailedAlert error={schedulesResult.error} onRetry={reload} />
      ) : schedules && schedules.length > 0 ? (
        <SchedulesTable
          schedules={schedules}
          language={i18n.language}
          selectedId={activeId}
          pendingId={pendingId}
          onSelect={setSelectedId}
          onToggle={toggleEnabled}
        />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('schedules.empty.title')}</EmptyTitle>
            <EmptyDescription>
              {t('schedules.empty.description')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {selected ? (
        <section className='space-y-3'>
          <h2 className='font-heading text-xl font-semibold'>
            {t('schedules.occurrences.title')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('schedules.occurrences.description', { title: selected.title })}
          </p>
          {occurrencesResult?.key !== occurrencesKey ? (
            <Loading label={t('schedules.occurrences.loading')} />
          ) : occurrencesResult?.error ? (
            <RequestFailedAlert
              error={occurrencesResult.error}
              onRetry={reload}
            />
          ) : occurrences && occurrences.length > 0 ? (
            <OccurrencesTable
              occurrences={occurrences}
              language={i18n.language}
            />
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>
                  {t('schedules.occurrences.empty.title')}
                </EmptyTitle>
                <EmptyDescription>
                  {t('schedules.occurrences.empty.description')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>
      ) : null}
    </PageContainer>
  );
}

interface SchedulesTableProps {
  readonly schedules: readonly ScheduleListItem[];
  readonly language: string;
  readonly selectedId?: string;
  readonly pendingId?: string;
  readonly onSelect: (scheduleId: string) => void;
  readonly onToggle: (schedule: ScheduleListItem) => void;
}

function SchedulesTable({
  schedules,
  language,
  selectedId,
  pendingId,
  onSelect,
  onToggle,
}: SchedulesTableProps): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='rounded-lg border border-border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('schedules.columns.title')}</TableHead>
            <TableHead>{t('schedules.columns.schedule')}</TableHead>
            <TableHead>{t('schedules.columns.status')}</TableHead>
            <TableHead>{t('schedules.columns.nextRunAt')}</TableHead>
            <TableHead>{t('schedules.columns.runs')}</TableHead>
            <TableHead className='text-right'>
              {t('schedules.columns.actions')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {schedules.map((schedule) => (
            <TableRow
              key={schedule.id}
              data-state={schedule.id === selectedId ? 'selected' : undefined}
            >
              <TableCell>
                <div className='font-medium'>{schedule.title}</div>
                <div className='text-xs text-muted-foreground'>
                  {schedule.key}
                </div>
              </TableCell>
              <TableCell className='text-muted-foreground'>
                <div>{schedule.cron}</div>
                <div className='text-xs'>{schedule.timezone}</div>
              </TableCell>
              <TableCell>
                <StatusBadge tone={schedule.enabled ? 'success' : 'neutral'}>
                  {t(
                    schedule.enabled
                      ? 'schedules.status.enabled'
                      : 'schedules.status.disabled',
                  )}
                </StatusBadge>
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {schedule.nextRunAt
                  ? formatDateTime(schedule.nextRunAt, language)
                  : '—'}
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {t('schedules.runs.value', {
                  runCount: schedule.runCount,
                  completedCount: schedule.completedCount,
                })}
              </TableCell>
              <TableCell className='text-right'>
                <div className='flex justify-end gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => onSelect(schedule.id)}
                    disabled={schedule.id === selectedId}
                  >
                    {t('schedules.action.viewRuns')}
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => onToggle(schedule)}
                    disabled={pendingId === schedule.id}
                  >
                    {pendingId === schedule.id ? <Spinner /> : null}
                    {schedule.enabled
                      ? t('schedules.action.disable')
                      : t('schedules.action.enable')}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface OccurrencesTableProps {
  readonly occurrences: readonly ScheduleOccurrence[];
  readonly language: string;
}

function OccurrencesTable({
  occurrences,
  language,
}: OccurrencesTableProps): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='rounded-lg border border-border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('schedules.occurrences.columns.status')}</TableHead>
            <TableHead>
              {t('schedules.occurrences.columns.startedAt')}
            </TableHead>
            <TableHead>
              {t('schedules.occurrences.columns.finishedAt')}
            </TableHead>
            <TableHead>{t('schedules.occurrences.columns.result')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {occurrences.map((occurrence) => (
            <TableRow key={occurrence.id}>
              <TableCell>
                <StatusBadge tone={OCCURRENCE_TONES[occurrence.status]}>
                  {t(`schedules.occurrenceStatus.${occurrence.status}`)}
                </StatusBadge>
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {formatDateTime(occurrence.startedAt, language)}
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {occurrence.finishedAt
                  ? formatDateTime(occurrence.finishedAt, language)
                  : '—'}
              </TableCell>
              <TableCell className='text-muted-foreground'>
                {formatOutcome(occurrence, t)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface RequestFailedAlertProps {
  readonly error: unknown;
  readonly onRetry: () => void;
}

function RequestFailedAlert({
  error,
  onRetry,
}: RequestFailedAlertProps): ReactElement {
  const { t } = useTranslation();
  const denied = error instanceof ApiClientError && error.status === 403;
  return (
    <Alert variant='destructive'>
      <AlertTitle>
        {denied ? t('schedules.error.deniedTitle') : t('schedules.error.title')}
      </AlertTitle>
      <AlertDescription>
        {denied
          ? t('schedules.error.deniedDescription')
          : (describeError(error) ?? t('schedules.error.unknown'))}
      </AlertDescription>
      <AlertAction>
        <Button variant='outline' size='sm' onClick={onRetry}>
          {t('schedules.error.retry')}
        </Button>
      </AlertAction>
    </Alert>
  );
}

const OCCURRENCE_TONES: Record<
  OccurrenceStatus,
  'success' | 'warning' | 'info' | 'neutral'
> = {
  succeeded: 'success',
  failed: 'warning',
  timed_out: 'warning',
  cancelled: 'neutral',
  skipped: 'neutral',
  pending: 'info',
  running: 'info',
  waiting: 'info',
  triggered: 'info',
};

function formatOutcome(
  occurrence: ScheduleOccurrence,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const summary = occurrence.resultSummary;
  if (summary && Object.keys(summary).length > 0) {
    if (typeof summary.expiredCount === 'number') {
      return t('schedules.occurrences.expiredCount', {
        count: summary.expiredCount,
      });
    }
    return JSON.stringify(summary);
  }
  return occurrence.reason ?? '—';
}

function formatDateTime(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function describeError(error: unknown): string | undefined {
  if (error instanceof ApiClientError) {
    return error.reason || error.message;
  }
  return undefined;
}
