'use client';

import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  CalendarClockIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { Spinner } from '#components/ui/spinner';

import type { Schedule } from './types.js';

export interface ScheduleActionsProps {
  readonly schedule: Schedule;
  readonly onViewRuns: () => void;
  readonly onChanged: (schedule: Schedule) => void;
}

/** A schedule's row actions: enable or disable it, and open its execution results. */
export function ScheduleActions({
  schedule,
  onViewRuns,
  onChanged,
}: ScheduleActionsProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [pending, setPending] = useState(false);

  async function setEnabled(enabled: boolean): Promise<void> {
    setPending(true);
    try {
      const { data } = await api.request<{ data: Schedule }>({
        path: `scheduler/schedules/${encodeURIComponent(schedule.id)}/${enabled ? 'enable' : 'disable'}`,
        method: 'POST',
      });
      toaster.show({
        type: 'success',
        title: enabled
          ? t('scheduler.enableSuccess', { title: data.title })
          : t('scheduler.disableSuccess', { title: data.title }),
      });
      onChanged(data);
    } catch (error) {
      toaster.show({
        type: 'error',
        title:
          error instanceof ApiClientError && error.status === 403
            ? t('scheduler.error.forbidden')
            : t('scheduler.error.requestFailed'),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant='ghost'
            size='icon-xs'
            disabled={pending}
            aria-label={t('scheduler.actions', { title: schedule.title })}
          />
        }
      >
        {pending ? <Spinner /> : <MoreHorizontalIcon />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-auto min-w-44'>
        <DropdownMenuItem onClick={onViewRuns}>
          <CalendarClockIcon />
          {t('scheduler.viewRuns')}
        </DropdownMenuItem>
        <DropdownMenuItem
          // An inactive schedule is one the application no longer defines; enabling it would not make it run.
          disabled={schedule.lifecycleState !== 'active' || pending}
          onClick={() => void setEnabled(!schedule.enabled)}
        >
          {schedule.enabled ? <PauseIcon /> : <PlayIcon />}
          {schedule.enabled ? t('scheduler.disable') : t('scheduler.enable')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
