import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import {
  CalendarClockIcon,
  Clock3Icon,
  HistoryIcon,
  PauseIcon,
  PlayIcon,
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
import type { ScheduleList, ScheduleListItem } from './schedules-types.js';
import { SettingsError, SettingsLoading } from './shared.js';

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

/**
 * Scheduler administration. The list is the scheduler plugin's stored projection, so an enable/disable action and the
 * next/last firing survive a reload; the execution history is the plugin's occurrence feed.
 */
export default function SchedulesPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const location = useLocation();
  const request = useSettingsData<ScheduleList>('scheduler/schedules');
  const [busyId, setBusyId] = useState<string>();
  const [toggleError, setToggleError] = useState<unknown>();

  const toggle = async (schedule: ScheduleListItem) => {
    setBusyId(schedule.id);
    setToggleError(undefined);
    try {
      await api.request({
        path: `scheduler/schedules/${encodeURIComponent(schedule.id)}/${
          schedule.enabled ? 'disable' : 'enable'
        }`,
        method: 'POST',
      });
      toaster.show({
        type: 'success',
        title: t(
          schedule.enabled
            ? 'todos.schedules.disabledToast'
            : 'todos.schedules.enabledToast',
        ),
      });
      request.reload();
    } catch (error) {
      setToggleError(error);
    } finally {
      setBusyId(undefined);
    }
  };

  const rows = request.data?.data ?? [];
  return (
    <>
      <PageContainer>
        <PageHeader
          title={t('todos.schedules.title')}
          description={t('todos.schedules.description')}
          actions={
            <Button
              variant='outline'
              onClick={request.reload}
              disabled={request.loading}
            >
              <RefreshCwIcon />
              {t('todos.schedules.refresh')}
            </Button>
          }
        />
        <SettingsError error={request.error} retry={request.reload} />
        <SettingsError error={toggleError} />
        {request.loading && !request.data ? (
          <SettingsLoading />
        ) : (
          !request.error &&
          (rows.length ? (
            <div className='divide-y overflow-hidden rounded-xl border bg-card'>
              {rows.map((schedule) => {
                const active =
                  schedule.enabled && schedule.lifecycleState === 'active';
                return (
                  <div
                    key={schedule.id}
                    className='flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between'
                  >
                    <div className='flex min-w-0 items-start gap-3'>
                      <div className='rounded-lg bg-primary/10 p-2 text-primary'>
                        <Clock3Icon className='size-4' />
                      </div>
                      <div className='min-w-0'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <p className='font-medium'>
                            {t(schedule.title as Parameters<typeof t>[0])}
                          </p>
                          <StatusBadge
                            size='sm'
                            tone={active ? 'success' : 'neutral'}
                          >
                            {t(
                              active
                                ? 'todos.schedules.enabled'
                                : 'todos.schedules.disabled',
                            )}
                          </StatusBadge>
                        </div>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          {schedule.key}
                        </p>
                        {schedule.description && (
                          <p className='mt-2 text-sm text-muted-foreground'>
                            {t(schedule.description as Parameters<typeof t>[0])}
                          </p>
                        )}
                        <dl className='mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2'>
                          <div className='flex gap-2'>
                            <dt>{t('todos.schedules.cron')}</dt>
                            <dd className='font-mono text-foreground'>
                              {schedule.cron}
                            </dd>
                          </div>
                          <div className='flex gap-2'>
                            <dt>{t('todos.schedules.timezone')}</dt>
                            <dd className='text-foreground'>
                              {schedule.timezone}
                            </dd>
                          </div>
                          <div className='flex gap-2'>
                            <dt>{t('todos.schedules.nextRun')}</dt>
                            <dd className='text-foreground'>
                              {formatDate(
                                schedule.nextRunAt,
                                i18n.language,
                                t('todos.schedules.never'),
                              )}
                            </dd>
                          </div>
                          <div className='flex gap-2'>
                            <dt>{t('todos.schedules.lastRun')}</dt>
                            <dd className='text-foreground'>
                              {formatDate(
                                schedule.lastRunAt,
                                i18n.language,
                                t('todos.schedules.never'),
                              )}
                            </dd>
                          </div>
                          <div className='flex gap-2'>
                            <dt>{t('todos.schedules.runCount')}</dt>
                            <dd className='text-foreground'>
                              {schedule.runCount}
                            </dd>
                          </div>
                          <div className='flex gap-2'>
                            <dt>{t('todos.schedules.completedCount')}</dt>
                            <dd className='text-foreground'>
                              {schedule.completedCount}
                            </dd>
                          </div>
                        </dl>
                        {schedule.lifecycleState === 'inactive' && (
                          <p className='mt-3 text-xs text-muted-foreground'>
                            {t('todos.schedules.inactive', {
                              reason:
                                schedule.inactiveReason ??
                                t('todos.schedules.unknownReason'),
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className='flex shrink-0 flex-wrap items-center gap-2'>
                      <Button
                        variant='outline'
                        size='sm'
                        nativeButton={false}
                        render={
                          <Link
                            to={{
                              pathname: `detail/${encodeURIComponent(
                                schedule.id,
                              )}`,
                              search: location.search,
                            }}
                          />
                        }
                      >
                        <HistoryIcon />
                        {t('todos.schedules.viewExecutions')}
                      </Button>
                      <Button
                        variant='outline'
                        size='sm'
                        disabled={
                          busyId === schedule.id ||
                          schedule.targetState !== 'ready'
                        }
                        onClick={() => void toggle(schedule)}
                      >
                        {schedule.enabled ? <PauseIcon /> : <PlayIcon />}
                        {busyId === schedule.id
                          ? t('todos.schedules.saving')
                          : t(
                              schedule.enabled
                                ? 'todos.schedules.disable'
                                : 'todos.schedules.enable',
                            )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty className='min-h-48 border border-dashed'>
              <EmptyMedia variant='icon'>
                <CalendarClockIcon />
              </EmptyMedia>
              <EmptyTitle>{t('todos.schedules.empty')}</EmptyTitle>
              <EmptyDescription>
                {t('todos.schedules.emptyHint')}
              </EmptyDescription>
            </Empty>
          ))
        )}
      </PageContainer>
    </>
  );
}
