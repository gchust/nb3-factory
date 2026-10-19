import type { UseTranslationResponse } from '@nocobase/i18n/client';

import type {
  TicketStatus,
  TicketStatusFilter,
  TicketUrgency,
} from './types.js';

export type TFunction = UseTranslationResponse<never, undefined>['t'];

export function statusLabel(t: TFunction, status: TicketStatus): string {
  return t(`itTickets.statuses.${status}`);
}

export function urgencyLabel(t: TFunction, urgency: TicketUrgency): string {
  return t(`itTickets.urgencies.${urgency}`);
}

export const STATUS_FILTERS: readonly TicketStatusFilter[] = [
  'open',
  'pending',
  'in_progress',
  'resolved',
  'closed',
];

export const URGENCY_FILTERS: readonly TicketUrgency[] = [
  'low',
  'medium',
  'high',
  'critical',
];

export function formatDate(
  value: string | null | undefined,
  language: string | undefined,
): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
