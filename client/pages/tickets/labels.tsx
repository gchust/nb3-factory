/* eslint-disable react-refresh/only-export-components -- the badge components and their label helpers are colocated */
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import type { TicketStatus, TicketUrgency } from './types.js';

const STATUS_TONES: Record<
  TicketStatus,
  'neutral' | 'info' | 'warning' | 'success'
> = {
  pending: 'warning',
  processing: 'info',
  resolved: 'neutral',
  closed: 'success',
};

const URGENCY_TONES: Record<
  TicketUrgency,
  'neutral' | 'info' | 'warning' | 'success'
> = {
  normal: 'neutral',
  urgent: 'warning',
  critical: 'warning',
};

const STATUSES: readonly TicketStatus[] = [
  'pending',
  'processing',
  'resolved',
  'closed',
];

const URGENCIES: readonly TicketUrgency[] = ['normal', 'urgent', 'critical'];

export function isTicketStatus(value: string): value is TicketStatus {
  return (STATUSES as readonly string[]).includes(value);
}

export function isTicketUrgency(value: string): value is TicketUrgency {
  return (URGENCIES as readonly string[]).includes(value);
}

/** The translation key for a status, falling back to the raw value for an unknown one. */
export function statusKey(status: string): string {
  return isTicketStatus(status) ? `tickets.status.${status}` : status;
}

/** The translation key for an urgency, falling back to the raw value for an unknown one. */
export function urgencyKey(urgency: string): string {
  return isTicketUrgency(urgency) ? `tickets.urgency.${urgency}` : urgency;
}

export function TicketStatusBadge({
  status,
}: {
  readonly status: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge
      tone={isTicketStatus(status) ? STATUS_TONES[status] : 'neutral'}
    >
      {t(statusKey(status))}
    </StatusBadge>
  );
}

export function UrgencyBadge({
  urgency,
}: {
  readonly urgency: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge
      tone={isTicketUrgency(urgency) ? URGENCY_TONES[urgency] : 'neutral'}
    >
      {t(urgencyKey(urgency))}
    </StatusBadge>
  );
}
