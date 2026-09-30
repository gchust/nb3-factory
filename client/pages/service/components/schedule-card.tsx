import { useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { CalendarClockIcon, PlayIcon, SettingsIcon } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { errorMessage } from '../service-api.js';
import {
  useAsync,
  useServiceApi,
  useServicePermission,
} from '../service-hooks.js';
import type { ServiceSchedule } from '../types.js';
import { DateTimeText, EmptyState } from './service-states.js';

/** Localized names for the two domain schedules, keyed by their schedule key. */
const SCHEDULE_TITLE_KEYS: Record<string, string> = {
  'service.daily-inspection': 'service.schedule.dailyInspection',
  'service.overdue-reminder': 'service.schedule.overdueReminder',
};

/**
 * The controlled immediate execution surface for the domain schedules.
 *
 * The Scheduler plugin's Settings page is read-only and its store, target
 * registry and occurrence history are package-private, so the application
 * exposes the run here, on the page that owns the records a run produces. The
 * call dispatches the *same* Scheduler target: the plugin's own Execution
 * records on Settings → Scheduled tasks shows the occurrence this button
 * started.
 */
export function ScheduleCard(): ReactElement | null {
  const { t } = useTranslation();
  const api = useServiceApi();
  const toaster = useToaster();
  const canManage = useServicePermission('service.inspections', 'manage');
  const { can: canViewRecords } = useCan({
    resource: { type: 'settings', id: 'scheduler.schedules' },
    action: 'read',
  });
  const schedules = useAsync(
    () => (canManage ? api.listSchedules() : Promise.resolve([])),
    canManage ? 'service-schedules' : 'service-schedules-blocked',
  );
  const [running, setRunning] = useState<string | null>(null);

  if (!canManage) return null;

  const titleOf = (schedule: ServiceSchedule): string =>
    t(SCHEDULE_TITLE_KEYS[schedule.key] ?? schedule.key);

  const run = async (schedule: ServiceSchedule): Promise<void> => {
    setRunning(schedule.key);
    try {
      await api.runSchedule(schedule.key);
      toaster.show({
        type: 'success',
        title: t('service.schedule.runStarted', { name: titleOf(schedule) }),
      });
      schedules.reload();
    } catch (error) {
      toaster.show({
        type: 'error',
        title: t('service.schedule.runFailed'),
        description: errorMessage(error),
      });
    } finally {
      setRunning(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('service.schedule.title')}</CardTitle>
        <CardDescription>{t('service.schedule.description')}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {schedules.error ? (
          <p className='text-sm text-destructive'>
            {errorMessage(schedules.error)}
          </p>
        ) : schedules.loading ? (
          <p className='text-sm text-muted-foreground'>
            {t('service.state.loading')}
          </p>
        ) : (schedules.data ?? []).length === 0 ? (
          <EmptyState title={t('service.schedule.none')} />
        ) : (
          <ul className='flex flex-col divide-y divide-border/60'>
            {(schedules.data ?? []).map((schedule) => (
              <li
                key={schedule.key}
                className='flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between'
              >
                <div className='min-w-0 space-y-1'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <CalendarClockIcon className='size-4 text-muted-foreground' />
                    <span className='font-medium'>{titleOf(schedule)}</span>
                    <Badge variant={schedule.enabled ? 'secondary' : 'outline'}>
                      {schedule.enabled
                        ? t('service.schedule.enabled')
                        : t('service.schedule.paused')}
                    </Badge>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {t('service.schedule.cronDescription', {
                      cron: schedule.cron,
                      timezone: schedule.timezone,
                    })}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {t('service.schedule.nextRun')}:{' '}
                    <DateTimeText value={schedule.nextRunAt} /> ·{' '}
                    {t('service.schedule.lastRun')}:{' '}
                    <DateTimeText value={schedule.lastRunAt} /> ·{' '}
                    {t('service.schedule.runCount', {
                      count: schedule.runCount,
                    })}
                  </p>
                </div>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={running === schedule.key}
                  onClick={() => void run(schedule)}
                >
                  <PlayIcon />
                  {running === schedule.key
                    ? t('service.schedule.running')
                    : t('service.schedule.runNow')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
          <SettingsIcon className='size-3.5' />
          <span>{t('service.schedule.executionRecords')}</span>
          {canViewRecords ? (
            <Link
              to='/settings/automation/schedules'
              className='text-primary underline-offset-4 hover:underline'
            >
              {t('service.schedule.settingsLink')}
            </Link>
          ) : (
            <span>{t('service.schedule.executionRecordsUnavailable')}</span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
