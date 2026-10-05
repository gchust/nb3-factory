/**
 * Execution plans — what is scheduled, and what its runs actually did.
 *
 * This is one card a supervisor can drop onto a page, not a page of its own. It
 * reads the plan the application registered with the Scheduler: the name, the
 * timezone, the on/off switch, when it last and next runs, and the Scheduler's
 * own execution records with their real status. Running a plan from here calls
 * the plan, so the run is recorded as one of those executions rather than as a
 * private action of this page; a run whose outcome is not final yet says so
 * instead of claiming success, and a receipt that never went through the plan
 * is labelled as a direct execution.
 *
 * A supervisor can also open the Scheduler's settings page, which shows every
 * plan — including ones this application does not own — and the same records.
 */
import { type ReactElement, useCallback, useState } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import {
  ExternalLinkIcon,
  Loader2,
  PlayIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { useServiceApi } from './api.js';
import { formatDateTime, useLoad } from './data.js';
import { EmptyState, LoadFailure, Loading } from './parts.js';
import type {
  ScheduledJobRunView,
  ScheduleView,
  SchedulesView,
} from './types.js';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

/** How each recorded occurrence state reads, as a tone and a locale key. */
const OCCURRENCE_TONE: Record<string, BadgeVariant> = {
  succeeded: 'default',
  failed: 'destructive',
  timed_out: 'destructive',
  cancelled: 'destructive',
  skipped: 'secondary',
  triggered: 'secondary',
  dispatched: 'outline',
  pending: 'secondary',
  running: 'outline',
  waiting: 'outline',
};

/** How long the page waits before reading the records again, in milliseconds. */
const REFRESH_AFTER_RUN_MS = 2_000;

function occurrenceLabel(key: string): string {
  return `service.schedule.status.${key}`;
}

function OccurrenceBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  const label = t(occurrenceLabel(status));
  return (
    <Badge variant={OCCURRENCE_TONE[status] ?? 'outline'}>
      {label === occurrenceLabel(status) ? status : label}
    </Badge>
  );
}

/** The result summary of one occurrence, as a short readable line. */
function resultSummary(result: Record<string, unknown> | null): string {
  if (!result) return '—';
  const parts = Object.entries(result).map(
    ([key, value]) => `${key}: ${String(value)}`,
  );
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function PlanRow({
  busy,
  onRun,
  plan,
  receipt,
}: {
  readonly busy: boolean;
  readonly onRun: (job: string) => void;
  readonly plan: ScheduleView;
  readonly receipt: ScheduledJobRunView | null;
}): ReactElement {
  const { t } = useTranslation();
  const own = receipt?.job === plan.job ? receipt : null;
  const title = plan.title || t(`service.schedule.job.${plan.job}`);
  return (
    <div className='space-y-3 rounded-lg border border-border p-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='space-y-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-sm font-medium'>{title}</span>
            {plan.enabled ? (
              <Badge variant='default'>{t('service.schedule.enabled')}</Badge>
            ) : (
              <Badge variant='secondary'>
                {t('service.schedule.disabled')}
              </Badge>
            )}
            {plan.registered ? null : (
              <Badge variant='destructive'>
                {t('service.schedule.unregistered')}
              </Badge>
            )}
          </div>
          <div className='text-xs text-muted-foreground'>
            {t('service.schedule.plan')}: {plan.cron || '—'} ·{' '}
            {t('service.schedule.timezone')}: {plan.timezone || '—'} ·{' '}
            {t('service.schedule.nextRun')}: {formatDateTime(plan.nextRunAt)} ·{' '}
            {t('service.schedule.lastRun')}: {formatDateTime(plan.lastRunAt)}
          </div>
          <div className='text-xs text-muted-foreground'>
            {t('service.schedule.runs')}: {plan.runCount} ·{' '}
            {t('service.schedule.completed')}: {plan.completedCount}
          </div>
        </div>
        <Button
          variant='outline'
          size='sm'
          disabled={busy}
          onClick={() => onRun(plan.job)}
        >
          {busy ? (
            <Loader2 className='size-3.5 animate-spin' />
          ) : (
            <PlayIcon className='size-3.5' />
          )}
          {t('service.schedule.runNow')}
        </Button>
      </div>

      {own ? (
        <div className='space-y-1 rounded-md bg-muted/40 p-3 text-xs'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='font-medium'>
              {t('service.schedule.lastRequest')}:
            </span>
            <OccurrenceBadge status={own.status} />
            {own.mode === 'direct' ? (
              <span className='text-muted-foreground'>
                {t('service.schedule.directRun')}
              </span>
            ) : null}
            {own.enabled ? null : (
              <span className='text-muted-foreground'>
                {t('service.schedule.ranWhileDisabled')}
              </span>
            )}
            <span className='text-muted-foreground'>{own.timezone}</span>
          </div>
          {own.reason ? (
            <div className='text-destructive'>{own.reason}</div>
          ) : null}
          {own.result ? (
            <div className='font-mono break-all'>
              {resultSummary(own.result)}
            </div>
          ) : null}
          {own.mode === 'scheduler' && own.status === 'dispatched' ? (
            <div className='text-muted-foreground'>
              {t('service.schedule.stillRunning')}
            </div>
          ) : null}
        </div>
      ) : null}

      {plan.occurrences.length === 0 ? (
        <EmptyState message={t('service.schedule.noRuns')} />
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full text-xs'>
            <thead className='text-left text-muted-foreground'>
              <tr>
                <th className='py-1 pr-3 font-normal'>
                  {t('service.schedule.startedAt')}
                </th>
                <th className='py-1 pr-3 font-normal'>
                  {t('service.schedule.result')}
                </th>
                <th className='py-1 pr-3 font-normal'>
                  {t('service.schedule.outcome')}
                </th>
                <th className='py-1 font-normal'>
                  {t('service.schedule.reason')}
                </th>
              </tr>
            </thead>
            <tbody>
              {plan.occurrences.slice(0, 5).map((row) => (
                <tr key={row.id} className='border-t border-border'>
                  <td className='py-1.5 pr-3 text-muted-foreground'>
                    {formatDateTime(row.startedAt)}
                  </td>
                  <td className='py-1.5 pr-3 font-mono break-all'>
                    {resultSummary(row.result)}
                  </td>
                  <td className='py-1.5 pr-3'>
                    <OccurrenceBadge status={row.status} />
                  </td>
                  <td className='py-1.5 text-muted-foreground'>
                    {row.reason ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ExecutionPlansCard(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [busy, setBusy] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ScheduledJobRunView | null>(null);

  const schedules = useLoad(
    useCallback(() => api.get<SchedulesView>('/schedules'), [api]),
  );

  const run = async (job: string): Promise<void> => {
    setBusy(job);
    setReceipt(null);
    try {
      const outcome = await api.post<ScheduledJobRunView>(
        `/schedules/${job}/run`,
      );
      setReceipt(outcome);
      schedules.reload();
      // The worker writes the occurrence a moment after the run is accepted, so
      // one delayed read shows the real outcome instead of an empty table.
      window.setTimeout(() => schedules.reload(), REFRESH_AFTER_RUN_MS);
    } catch (error) {
      api.report(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center justify-between gap-3 text-base'>
          <span>{t('service.schedule.title')}</span>
          <div className='flex gap-2'>
            <Button
              variant='ghost'
              size='sm'
              disabled={schedules.loading}
              onClick={() => schedules.reload()}
            >
              <RefreshCwIcon className='size-3.5' />
              {t('service.common.refresh')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              render={<Link to='/settings/schedules' />}
            >
              <ExternalLinkIcon className='size-3.5' />
              {t('service.schedule.records')}
            </Button>
          </div>
        </CardTitle>
        <p className='text-sm text-muted-foreground'>
          {t('service.schedule.description')}
        </p>
      </CardHeader>
      <CardContent className='space-y-3'>
        {schedules.loading ? <Loading /> : null}
        {schedules.error ? (
          <LoadFailure
            message={schedules.error}
            onRetry={() => schedules.reload()}
          />
        ) : null}
        {schedules.data?.jobs.map((plan) => (
          <PlanRow
            key={plan.job}
            plan={plan}
            busy={busy === plan.job}
            receipt={receipt}
            onRun={(job) => {
              void run(job);
            }}
          />
        ))}
      </CardContent>
    </Card>
  );
}
