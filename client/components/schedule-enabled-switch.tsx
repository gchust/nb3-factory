import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';

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
import { Switch } from '#components/ui/switch';
import type { Schedule } from '#pages/schedules/types';

interface ScheduleEnabledSwitchProps {
  readonly disabled?: boolean;
  readonly onChange: (enabled: boolean) => void;
  readonly schedule: Schedule;
}

/**
 * The control that flips one scheduling plan on or off.
 *
 * Enabling applies at once (T4.3). Disabling stops the task from running, so it is treated as a destructive action and
 * confirmed first (I2); because `checked` follows the row's stored state rather than local state, cancelling leaves the
 * switch on and a confirmed change settles only once the Scheduler's response comes back.
 */
export function ScheduleEnabledSwitch({
  disabled,
  onChange,
  schedule,
}: ScheduleEnabledSwitchProps): ReactElement {
  const { t } = useTranslation();
  const [confirmingDisable, setConfirmingDisable] = useState(false);

  return (
    <>
      <Switch
        aria-label={t('schedules.toggle', { title: schedule.title })}
        checked={schedule.enabled}
        disabled={disabled}
        onCheckedChange={(enabled) => {
          if (enabled) {
            onChange(true);
          } else {
            setConfirmingDisable(true);
          }
        }}
      />
      <AlertDialog onOpenChange={setConfirmingDisable} open={confirmingDisable}>
        <AlertDialogContent size='sm'>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('schedules.disableConfirmTitle', { title: schedule.title })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('schedules.disableConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmingDisable(false);
                onChange(false);
              }}
              variant='destructive'
            >
              {t('schedules.disable')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
