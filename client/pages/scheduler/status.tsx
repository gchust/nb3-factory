import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import type { OccurrenceStatus, ScheduleTargetState } from './types.js';

/** Whether an administrator has the Schedule switched on. */
export function ScheduleEnabledBadge({
  enabled,
}: {
  readonly enabled: boolean;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={enabled ? 'success' : 'neutral'}>
      {enabled ? t('scheduler.enabled') : t('scheduler.disabled')}
    </StatusBadge>
  );
}

/** Whether the target a Schedule points at is registered and runnable. */
export function TargetStateBadge({
  state,
}: {
  readonly state: ScheduleTargetState;
}): ReactElement {
  const { t } = useTranslation();
  const tones: Record<ScheduleTargetState, 'success' | 'warning' | 'neutral'> =
    {
      ready: 'success',
      disabled: 'neutral',
      missing: 'warning',
      invalid: 'warning',
    };
  return (
    <StatusBadge tone={tones[state]}>
      {t(`scheduler.targetState.${state}`)}
    </StatusBadge>
  );
}

/** The terminal or in-flight state of one firing. */
export function OccurrenceStatusBadge({
  status,
}: {
  readonly status: OccurrenceStatus;
}): ReactElement {
  const { t } = useTranslation();
  const tones: Record<
    OccurrenceStatus,
    'success' | 'warning' | 'info' | 'neutral'
  > = {
    succeeded: 'success',
    failed: 'warning',
    timed_out: 'warning',
    running: 'info',
    pending: 'info',
    waiting: 'info',
    triggered: 'info',
    skipped: 'neutral',
    cancelled: 'neutral',
  };
  return (
    <StatusBadge tone={tones[status]}>
      {t(`scheduler.occurrenceStatus.${status}`)}
    </StatusBadge>
  );
}
