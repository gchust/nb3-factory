import { ApiClientError } from '@nocobase/app-client';

import type { TicketPriority, TicketStatus } from './types.js';

export function ticketStatusTone(
  status: TicketStatus,
): 'neutral' | 'info' | 'warning' | 'success' {
  switch (status) {
    case 'open':
      return 'info';
    case 'assigned':
      return 'warning';
    case 'resolved':
      return 'success';
    case 'closed':
      return 'neutral';
  }
}

export function priorityTone(
  priority: TicketPriority,
): 'neutral' | 'info' | 'warning' {
  switch (priority) {
    case 'urgent':
    case 'high':
      return 'warning';
    case 'normal':
      return 'info';
    case 'low':
      return 'neutral';
  }
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function requestErrorMessage(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401)
      return t('serviceDesk.errors.unauthenticated', {
        defaultValue: 'Your session has expired. Sign in again.',
      });
    if (error.status === 403)
      return t('serviceDesk.errors.forbidden', {
        defaultValue: 'You do not have permission to do this.',
      });
    if (error.status === 404)
      return t('serviceDesk.errors.notFound', {
        defaultValue: 'This item no longer exists.',
      });
  }
  return t('serviceDesk.errors.generic', {
    defaultValue: 'The request failed. Try again.',
  });
}
