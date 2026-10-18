import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  HistoryIcon,
  MoreHorizontalIcon,
  PowerIcon,
  PowerOffIcon,
} from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { Link, useLocation } from 'react-router';

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { Spinner } from '#components/ui/spinner';

import type { Schedule } from './types.js';

/**
 * Enables or disables one Schedule through the Scheduler plugin's routes. The plugin owns the state; this reports the
 * outcome and hands the updated plan back so the caller can replace what it shows. `pendingId` names the plan whose
 * request is in flight, so a row can disable only itself while another row's toggle runs.
 */
function useScheduleToggle(onChanged: (schedule: Schedule) => void): {
  readonly pendingId?: string;
  readonly toggle: (schedule: Schedule) => Promise<void>;
} {
  const api = useApiClient();
  const { t } = useTranslation();
  const toaster = useToaster();
  const [pendingId, setPendingId] = useState<string>();

  async function toggle(schedule: Schedule): Promise<void> {
    const action = schedule.enabled ? 'disable' : 'enable';
    setPendingId(schedule.id);
    try {
      const { data } = await api.request<{ readonly data: Schedule }>({
        path: `scheduler/schedules/${encodeURIComponent(schedule.id)}/${action}`,
        method: 'POST',
      });
      onChanged(data);
      toaster.show({
        type: 'success',
        title:
          action === 'disable'
            ? t('scheduler.actions.disableSuccess', { title: schedule.title })
            : t('scheduler.actions.enableSuccess', { title: schedule.title }),
      });
    } catch {
      toaster.show({
        type: 'error',
        title: t('scheduler.actions.toggleFailed'),
      });
    } finally {
      setPendingId(undefined);
    }
  }

  return { pendingId, toggle };
}

/**
 * Disabling pauses a schedule, so it goes through an AlertDialog first (I2): the title names the plan and the confirm
 * button names the action. Enabled by the caller so it stacks over whatever opened it.
 */
function DisableScheduleDialog({
  schedule,
  pending,
  onOpenChange,
  onConfirm,
}: {
  readonly schedule?: Schedule;
  readonly pending: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <AlertDialog open={schedule !== undefined} onOpenChange={onOpenChange}>
      <AlertDialogContent size='sm'>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('scheduler.actions.disableConfirmTitle', {
              title: schedule?.title ?? '',
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('scheduler.actions.disableConfirmDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {t('scheduler.actions.disable')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * A list row's actions behind one icon-only "…" button (T1.5): the link into the plan's execution history, then the
 * enable/disable action. Disabling is destructive, so it is last, styled destructively and confirmed.
 */
export function ScheduleRowActions({
  schedule,
  onChanged,
}: {
  readonly schedule: Schedule;
  readonly onChanged: (schedule: Schedule) => void;
}): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const { pendingId, toggle } = useScheduleToggle(onChanged);
  const [confirming, setConfirming] = useState(false);
  const pending = pendingId === schedule.id;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant='ghost'
              size='icon-sm'
              disabled={pending}
              aria-label={t('scheduler.actions.rowLabel', {
                title: schedule.title,
              })}
            />
          }
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-auto min-w-40'>
          <DropdownMenuItem
            className='gap-2'
            render={
              <Link to={{ pathname: schedule.id, search: location.search }} />
            }
          >
            <HistoryIcon className='size-4' />
            {t('scheduler.actions.viewOccurrences')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className='gap-2'
            variant={schedule.enabled ? 'destructive' : 'default'}
            onClick={() => {
              if (schedule.enabled) setConfirming(true);
              else void toggle(schedule);
            }}
          >
            {schedule.enabled ? (
              <PowerOffIcon className='size-4' />
            ) : (
              <PowerIcon className='size-4' />
            )}
            {schedule.enabled
              ? t('scheduler.actions.disable')
              : t('scheduler.actions.enable')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DisableScheduleDialog
        schedule={confirming ? schedule : undefined}
        pending={pending}
        onOpenChange={(open) => {
          if (!open) setConfirming(false);
        }}
        onConfirm={() => {
          void toggle(schedule).finally(() => setConfirming(false));
        }}
      />
    </>
  );
}

/** The plan header's enable/disable control, used where a row menu would be heavier than the page needs. */
export function ScheduleEnabledAction({
  schedule,
  onChanged,
}: {
  readonly schedule: Schedule;
  readonly onChanged: (schedule: Schedule) => void;
}): ReactElement {
  const { t } = useTranslation();
  const { pendingId, toggle } = useScheduleToggle(onChanged);
  const [confirming, setConfirming] = useState(false);
  const pending = pendingId === schedule.id;

  return (
    <>
      <Button
        variant='outline'
        disabled={pending}
        onClick={() => {
          if (schedule.enabled) setConfirming(true);
          else void toggle(schedule);
        }}
      >
        {schedule.enabled ? <PowerOffIcon /> : <PowerIcon />}
        {schedule.enabled
          ? t('scheduler.actions.disable')
          : t('scheduler.actions.enable')}
      </Button>
      <DisableScheduleDialog
        schedule={confirming ? schedule : undefined}
        pending={pending}
        onOpenChange={(open) => {
          if (!open) setConfirming(false);
        }}
        onConfirm={() => {
          void toggle(schedule).finally(() => setConfirming(false));
        }}
      />
    </>
  );
}
