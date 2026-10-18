import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CalendarClockIcon, RefreshCwIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { StatusBadge } from '#components/status-badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Spinner } from '#components/ui/spinner';
import { useDateFormat } from '#hooks/use-date-format';

import { fetchSchedules, setScheduleEnabled } from './api.js';
import type { Schedule, ScheduleList } from './types.js';

/**
 * The Scheduler's management page.
 *
 * The Scheduler plugin ships no page of its own, but it exposes the list, the enable and disable endpoints and the
 * occurrence history. This page is those endpoints over the Schedules the application registers in server code:
 * the plan's name, whether it is switched on, what it did last, and the way into its execution records.
 */
export default function SchedulesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { formatDateTime } = useDateFormat();

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = String(reloadCount);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly list?: ScheduleList;
    readonly error?: unknown;
  }>();
  const [rows, setRows] = useState<readonly Schedule[]>([]);
  const [pendingId, setPendingId] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    fetchSchedules(api, controller.signal).then(
      (list) => {
        if (controller.signal.aborted) return;
        setResult({ key: String(reloadCount), list });
        setRows(list.data);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key: String(reloadCount), error });
      },
    );
    return () => controller.abort();
  }, [api, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);
  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;

  const setEnabled = async (
    schedule: Schedule,
    enabled: boolean,
  ): Promise<void> => {
    setPendingId(schedule.id);
    try {
      const updated = await setScheduleEnabled(api, schedule.id, enabled);
      setRows((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
      void toaster.show({
        type: 'success',
        title: enabled
          ? t('schedules.enabled', { title: schedule.title })
          : t('schedules.disabled', { title: schedule.title }),
      });
    } catch (cause) {
      void toaster.show({
        type: 'error',
        title:
          cause instanceof ApiClientError && cause.status === 403
            ? t('schedules.forbidden')
            : t('schedules.toggleFailed'),
      });
    } finally {
      setPendingId(undefined);
    }
  };

  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <PageHeader
        title={t('schedules.title')}
        description={t('schedules.description')}
        actions={
          <Button
            variant='ghost'
            size='icon'
            onClick={reload}
            disabled={loading}
            aria-label={t('schedules.refresh')}
            title={t('schedules.refresh')}
          >
            {loading ? <Spinner /> : <RefreshCwIcon />}
          </Button>
        }
      />

      {error ? (
        <SchedulesError error={error} onRetry={reload} retrying={loading} />
      ) : loading && result?.list === undefined ? (
        <Loading className='py-24' label={t('schedules.loading')} />
      ) : rows.length === 0 ? (
        <Empty className='min-h-48 border border-dashed'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <CalendarClockIcon />
            </EmptyMedia>
            <EmptyTitle>{t('schedules.empty.title')}</EmptyTitle>
            <EmptyDescription>
              {t('schedules.empty.description')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className='divide-y divide-border overflow-hidden rounded-xl border border-border bg-card'>
          {rows.map((schedule) => (
            <ScheduleRow
              key={schedule.id}
              schedule={schedule}
              pending={pendingId === schedule.id}
              formatDateTime={formatDateTime}
              onSetEnabled={(enabled) => void setEnabled(schedule, enabled)}
            />
          ))}
        </ul>
      )}

      {/* The execution records live at `:scheduleId/occurrences`, an overlay over this page, so it renders here. */}
      <Outlet />
    </PageContainer>
  );
}

function ScheduleRow({
  schedule,
  pending,
  formatDateTime,
  onSetEnabled,
}: {
  readonly schedule: Schedule;
  readonly pending: boolean;
  readonly formatDateTime: (value: string) => string;
  readonly onSetEnabled: (enabled: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const active = schedule.scheduleStatus === 'active';

  return (
    <li className='flex flex-wrap items-start justify-between gap-4 p-4'>
      <div className='flex min-w-0 flex-col gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='font-medium'>{schedule.title}</span>
          <StatusBadge tone={active ? 'success' : 'neutral'}>
            {active
              ? t('schedules.status.active')
              : t('schedules.status.paused')}
          </StatusBadge>
          {schedule.targetState === 'ready' ? null : (
            <StatusBadge tone='warning'>
              {t(`schedules.targetState.${schedule.targetState}`)}
            </StatusBadge>
          )}
        </div>
        {schedule.description ? (
          <p className='max-w-xl text-sm text-muted-foreground'>
            {schedule.description}
          </p>
        ) : null}
        <p className='font-mono text-xs text-muted-foreground'>
          {schedule.cron} · {schedule.timezone}
        </p>
        <dl className='flex flex-wrap gap-x-6 gap-y-1 text-sm'>
          <div className='flex gap-1.5'>
            <dt className='text-muted-foreground'>{t('schedules.nextRun')}</dt>
            <dd>
              {schedule.nextRunAt
                ? formatDateTime(schedule.nextRunAt)
                : t('schedules.noNextRun')}
            </dd>
          </div>
          <div className='flex gap-1.5'>
            <dt className='text-muted-foreground'>{t('schedules.lastRun')}</dt>
            <dd>
              {schedule.lastRunAt
                ? formatDateTime(schedule.lastRunAt)
                : t('schedules.neverRun')}
            </dd>
          </div>
          <div className='flex gap-1.5'>
            <dt className='text-muted-foreground'>{t('schedules.runs')}</dt>
            <dd>
              {t('schedules.runCounts', {
                runs: schedule.runCount,
                succeeded: schedule.completedCount,
              })}
            </dd>
          </div>
        </dl>
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          render={<Link to={occurrencesPath(schedule.id)} />}
        >
          {t('schedules.occurrences.open')}
        </Button>
        {active ? (
          <>
            <Button
              variant='ghost'
              size='sm'
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              {pending ? <Spinner data-icon='inline-start' /> : null}
              {t('schedules.disable')}
            </Button>
            <AlertDialog open={confirming} onOpenChange={setConfirming}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('schedules.disableConfirm.title', {
                      title: schedule.title,
                    })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('schedules.disableConfirm.description')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    {t('schedules.disableConfirm.cancel')}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    variant='destructive'
                    onClick={() => {
                      setConfirming(false);
                      onSetEnabled(false);
                    }}
                  >
                    {t('schedules.disableConfirm.confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <Button
            variant='ghost'
            size='sm'
            disabled={pending}
            onClick={() => onSetEnabled(true)}
          >
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {t('schedules.enable')}
          </Button>
        )}
      </div>
    </li>
  );
}

/** The child route's path, relative to this page. */
function occurrencesPath(scheduleId: string): string {
  return `${encodeURIComponent(scheduleId)}/occurrences`;
}

function SchedulesError({
  error,
  onRetry,
  retrying,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly retrying: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const denied = error instanceof ApiClientError && error.status === 403;

  return (
    <div className='flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center'>
      <p className='font-medium'>
        {denied ? t('schedules.error.forbidden') : t('schedules.error.title')}
      </p>
      <p className='max-w-md text-sm text-muted-foreground'>
        {denied
          ? t('schedules.error.forbiddenDescription')
          : t('schedules.error.description')}
      </p>
      {denied ? null : (
        <Button variant='outline' onClick={onRetry} disabled={retrying}>
          {retrying ? <Spinner /> : null}
          {t('schedules.error.retry')}
        </Button>
      )}
    </div>
  );
}
