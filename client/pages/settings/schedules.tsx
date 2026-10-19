import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  CalendarClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  HistoryIcon,
  PauseIcon,
  PlayIcon,
} from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { useSettingsData } from './hooks.js';
import { SettingsError, SettingsLoading } from './shared.js';

const PAGE_SIZE = 20;

interface Schedule {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly targetType: string;
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
    readonly href?: string;
    readonly state?: 'ready' | 'disabled' | 'missing' | 'invalid';
  };
}

interface ScheduleList {
  readonly data: readonly Schedule[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

type OccurrenceStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'timed_out'
  | 'triggered';

interface Occurrence {
  readonly id: string;
  readonly status: OccurrenceStatus;
  readonly reason?: string;
  readonly executionCount: number;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly resultSummary?: Readonly<Record<string, unknown>>;
}

interface OccurrenceList {
  readonly data: readonly Occurrence[];
  readonly meta: { readonly nextPageToken?: string };
}

const HISTORY_PAGE_SIZE = 10;

function statusVariant(
  status: OccurrenceStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'succeeded') return 'default';
  if (status === 'failed' || status === 'timed_out' || status === 'cancelled')
    return 'destructive';
  if (status === 'pending' || status === 'running' || status === 'waiting')
    return 'secondary';
  return 'outline';
}

function formatMoment(value: string | undefined, never: string): string {
  return value ? new Date(value).toLocaleString() : never;
}

/**
 * The plugin keeps every firing, so the page shows them on demand rather than loading a history nobody opened. The
 * occurrence feed pages by cursor: an offset can repeat a row a new firing pushed down, but it never skips one.
 */
function ScheduleHistoryDialog({
  schedule,
  onClose,
}: {
  schedule: Schedule;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [pageToken, setPageToken] = useState<string>();
  const path = `scheduler/schedules/${encodeURIComponent(schedule.id)}/occurrences?pageSize=${HISTORY_PAGE_SIZE}${
    pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
  }`;
  const request = useSettingsData<OccurrenceList>(path, true);
  const occurrences = request.data?.data ?? [];
  const nextPageToken = request.data?.meta.nextPageToken;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>
            {t('schedulerAdmin.historyTitle', { title: schedule.title })}
          </DialogTitle>
          <DialogDescription>
            {t('schedulerAdmin.historyDescription')}
          </DialogDescription>
        </DialogHeader>

        {request.error ? (
          <SettingsError error={request.error} retry={request.reload} />
        ) : null}
        {request.loading && !request.data ? <SettingsLoading /> : null}
        {request.data && occurrences.length === 0 ? (
          <p className='py-8 text-center text-sm text-muted-foreground'>
            {t('schedulerAdmin.historyEmpty')}
          </p>
        ) : null}
        {occurrences.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('schedulerAdmin.historyStatus')}</TableHead>
                <TableHead>{t('schedulerAdmin.historyStarted')}</TableHead>
                <TableHead>{t('schedulerAdmin.historyFinished')}</TableHead>
                <TableHead>{t('schedulerAdmin.historyResult')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {occurrences.map((occurrence) => (
                <TableRow key={occurrence.id}>
                  <TableCell>
                    <Badge variant={statusVariant(occurrence.status)}>
                      {t(
                        `schedulerAdmin.occurrenceStatuses.${occurrence.status}`,
                      )}
                    </Badge>
                    {occurrence.reason ? (
                      <p className='mt-1 text-xs text-muted-foreground'>
                        {occurrence.reason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {formatMoment(
                      occurrence.startedAt,
                      t('schedulerAdmin.never'),
                    )}
                  </TableCell>
                  <TableCell>
                    {formatMoment(
                      occurrence.finishedAt,
                      t('schedulerAdmin.never'),
                    )}
                  </TableCell>
                  <TableCell className='max-w-64 truncate whitespace-normal'>
                    {occurrence.resultSummary
                      ? JSON.stringify(occurrence.resultSummary)
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}

        <DialogFooter>
          {pageToken ? (
            <Button variant='outline' onClick={() => setPageToken(undefined)}>
              {t('schedulerAdmin.historyFirst')}
            </Button>
          ) : null}
          {nextPageToken ? (
            <Button
              variant='outline'
              disabled={request.loading}
              onClick={() => setPageToken(nextPageToken)}
            >
              {t('schedulerAdmin.next')}
              <ChevronRightIcon data-icon='inline-end' />
            </Button>
          ) : null}
          <Button onClick={onClose}>{t('schedulerAdmin.historyClose')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SchedulesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string>();
  const [history, setHistory] = useState<Schedule>();
  const [actionError, setActionError] = useState<unknown>();
  const path = useMemo(
    () => `scheduler/schedules?page=${page}&pageSize=${PAGE_SIZE}`,
    [page],
  );
  const request = useSettingsData<ScheduleList>(path, true);
  const data = request.data;
  const schedules = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const setEnabled = async (schedule: Schedule, enabled: boolean) => {
    setBusyId(schedule.id);
    setActionError(undefined);
    try {
      const { data: updated } = await api.request<{ data: Schedule }>({
        path: `scheduler/schedules/${encodeURIComponent(schedule.id)}/${enabled ? 'enable' : 'disable'}`,
        method: 'POST',
      });
      if (data) {
        request.replaceData({
          ...data,
          data: data.data.map((row) => (row.id === updated.id ? updated : row)),
        });
      }
    } catch (next) {
      setActionError(next);
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <PageContainer className='mx-auto max-w-5xl'>
      <PageHeader
        title={t('schedulerAdmin.title')}
        description={t('schedulerAdmin.description')}
      />

      <Alert>
        <AlertDescription>{t('schedulerAdmin.hint')}</AlertDescription>
      </Alert>

      {request.error && !data ? (
        <SettingsError error={request.error} retry={request.reload} />
      ) : null}
      {actionError ? (
        <Alert variant='destructive'>
          <AlertDescription>
            {t('schedulerAdmin.updateFailed')}
          </AlertDescription>
        </Alert>
      ) : null}

      {request.loading && !data ? <SettingsLoading /> : null}

      {data && schedules.length === 0 ? (
        <Card>
          <CardContent className='py-10 text-center text-sm text-muted-foreground'>
            {t('schedulerAdmin.empty')}
          </CardContent>
        </Card>
      ) : null}

      <div className='flex flex-col gap-4'>
        {schedules.map((schedule) => (
          <Card key={schedule.id}>
            <CardHeader className='gap-3'>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='min-w-0'>
                  <CardTitle className='flex flex-wrap items-center gap-2'>
                    {schedule.title}
                    <Badge
                      variant={
                        schedule.scheduleStatus === 'active'
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {t(
                        schedule.scheduleStatus === 'active'
                          ? 'schedulerAdmin.statusActive'
                          : 'schedulerAdmin.statusPaused',
                      )}
                    </Badge>
                    {schedule.lifecycleState === 'inactive' ? (
                      <Badge variant='destructive'>
                        {t('schedulerAdmin.statusInactive')}
                      </Badge>
                    ) : null}
                  </CardTitle>
                  {schedule.description ? (
                    <CardDescription className='mt-1'>
                      {schedule.description}
                    </CardDescription>
                  ) : null}
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => setHistory(schedule)}
                  >
                    <HistoryIcon data-icon='inline-start' />
                    {t('schedulerAdmin.history')}
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={
                      busyId === schedule.id ||
                      schedule.lifecycleState === 'inactive'
                    }
                    onClick={() => void setEnabled(schedule, !schedule.enabled)}
                  >
                    {schedule.enabled ? (
                      <PauseIcon data-icon='inline-start' />
                    ) : (
                      <PlayIcon data-icon='inline-start' />
                    )}
                    {busyId === schedule.id
                      ? t('schedulerAdmin.updating')
                      : schedule.enabled
                        ? t('schedulerAdmin.disable')
                        : t('schedulerAdmin.enable')}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className='flex flex-col gap-3 text-sm'>
              <div className='flex flex-wrap items-center gap-x-6 gap-y-2 text-muted-foreground'>
                <span className='inline-flex items-center gap-1.5'>
                  <CalendarClockIcon className='size-4' aria-hidden />
                  <span>
                    {t('schedulerAdmin.cron')}:{' '}
                    <code className='rounded bg-muted px-1 py-0.5 text-xs text-foreground'>
                      {schedule.cron}
                    </code>{' '}
                    ({schedule.timezone})
                  </span>
                </span>
                <span>
                  {t('schedulerAdmin.nextRun')}:{' '}
                  {schedule.nextRunAt
                    ? new Date(schedule.nextRunAt).toLocaleString()
                    : t('schedulerAdmin.never')}
                </span>
                <span>
                  {t('schedulerAdmin.lastRun')}:{' '}
                  {schedule.lastRunAt
                    ? new Date(schedule.lastRunAt).toLocaleString()
                    : t('schedulerAdmin.never')}
                </span>
              </div>
              <div className='flex flex-wrap items-center gap-x-6 gap-y-2'>
                <span>
                  {t('schedulerAdmin.runs', { count: schedule.runCount })}
                </span>
                <span>
                  {t('schedulerAdmin.completedRuns', {
                    count: schedule.completedCount,
                  })}
                </span>
                <span className='inline-flex items-center gap-1.5'>
                  {t('schedulerAdmin.target')}:
                  {schedule.targetSummary.href ? (
                    <Link
                      className='inline-flex items-center gap-1 font-medium text-primary hover:underline'
                      to={schedule.targetSummary.href}
                    >
                      {schedule.targetSummary.targetLabel}
                      <ExternalLinkIcon className='size-3' aria-hidden />
                    </Link>
                  ) : (
                    <span className='font-medium'>
                      {schedule.targetSummary.targetLabel}
                    </span>
                  )}
                  <Badge
                    variant={
                      schedule.targetState === 'ready'
                        ? 'outline'
                        : 'destructive'
                    }
                  >
                    {t(`schedulerAdmin.targetStates.${schedule.targetState}`)}
                  </Badge>
                </span>
              </div>
              <p className='text-xs text-muted-foreground'>
                {t('schedulerAdmin.key', { key: schedule.key })}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {total > PAGE_SIZE ? (
        <div className='flex items-center justify-between gap-2'>
          <p className='text-sm text-muted-foreground'>
            {t('schedulerAdmin.pageOf', { page, pages: pageCount })}
          </p>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={page <= 1 || request.loading}
              onClick={() => setPage(Math.max(1, page - 1))}
            >
              <ChevronLeftIcon data-icon='inline-start' />
              {t('schedulerAdmin.previous')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={page >= pageCount || request.loading}
              onClick={() => setPage(Math.min(pageCount, page + 1))}
            >
              {t('schedulerAdmin.next')}
              <ChevronRightIcon data-icon='inline-end' />
            </Button>
          </div>
        </div>
      ) : null}

      {history ? (
        <ScheduleHistoryDialog
          key={history.id}
          schedule={history}
          onClose={() => setHistory(undefined)}
        />
      ) : null}
    </PageContainer>
  );
}
