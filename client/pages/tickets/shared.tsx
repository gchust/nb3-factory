/**
 * The pieces the ticket pages share: state and urgency labels and a labelled read-only field.
 */
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, ReactNode } from 'react';

import { StatusBadge } from '#components/status-badge';

import type { TicketState, TicketUrgency } from '#hooks/service-desk';

const STATE_TONES: Record<
  TicketState,
  'neutral' | 'info' | 'warning' | 'success'
> = {
  submitted: 'warning',
  assigned: 'info',
  processing: 'info',
  resolved: 'success',
  returned: 'warning',
  closed: 'neutral',
  cancelled: 'neutral',
};

const URGENCY_TONES: Record<
  TicketUrgency,
  'neutral' | 'info' | 'warning' | 'success'
> = {
  low: 'neutral',
  normal: 'info',
  high: 'warning',
  urgent: 'warning',
};

export function TicketStateBadge({
  state,
}: {
  readonly state: TicketState;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={STATE_TONES[state]}>
      {t(`serviceDesk.state.${state}`)}
    </StatusBadge>
  );
}

export function UrgencyBadge({
  urgency,
}: {
  readonly urgency: TicketUrgency;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={URGENCY_TONES[urgency]}>
      {t(`serviceDesk.urgency.${urgency}`)}
    </StatusBadge>
  );
}

/** A labelled read-only row of a record: the label on the left, the value on the right. */
export function DetailField({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='grid gap-1'>
      <dt className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
        {label}
      </dt>
      <dd className='text-sm break-words'>{children}</dd>
    </div>
  );
}
