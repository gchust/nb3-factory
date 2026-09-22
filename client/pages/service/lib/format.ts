import type { useTranslation } from '@nocobase/i18n/client';

type TranslateFunction = ReturnType<typeof useTranslation>['t'];

export const REGION_OPTIONS = [
  'east',
  'south',
  'north',
  'west',
  'none',
] as const;
export const TICKET_STATUS_OPTIONS = [
  'draft',
  'pending_dispatch',
  'in_progress',
  'pending_confirmation',
  'closed',
  'cancelled',
] as const;
export const PRIORITY_OPTIONS = ['low', 'normal', 'high', 'urgent'] as const;
export const INSPECTION_STATUS_OPTIONS = [
  'pending',
  'completed',
  'skipped',
] as const;

export const REGION_ASSIGNABLE = ['east', 'south', 'north', 'west'] as const;

export function regionLabel(
  t: TranslateFunction,
  value: string | null | undefined,
): string {
  if (!value) return t('service.regions.none', { defaultValue: 'Unassigned' });
  return t(`service.regions.${value}`, { defaultValue: value });
}

export function statusTone(
  value: string | null | undefined,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (value) {
    case 'closed':
    case 'completed':
    case 'published':
    case 'active':
      return 'default';
    case 'cancelled':
    case 'urgent':
      return 'destructive';
    case 'in_progress':
    case 'pending_confirmation':
    case 'high':
      return 'secondary';
    default:
      return 'outline';
  }
}

export function ticketStatusLabel(t: TranslateFunction, value: string): string {
  return t(`service.status.${value}`, { defaultValue: value });
}

export function priorityLabel(t: TranslateFunction, value: string): string {
  return t(`service.priority.${value}`, { defaultValue: value });
}

export function inspectionStatusLabel(
  t: TranslateFunction,
  value: string,
): string {
  return t(`service.inspectionStatus.${value}`, { defaultValue: value });
}

export function knowledgeStatusLabel(
  t: TranslateFunction,
  value: string,
): string {
  return t(`service.knowledgeStatus.${value}`, { defaultValue: value });
}

export function logActionLabel(t: TranslateFunction, value: string): string {
  return t(`service.logAction.${value}`, { defaultValue: value });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

export function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

/** Renders an arbitrary JSON result as readable text for a history table. */
export function formatResult(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    return String(value);
  if (typeof value === 'symbol') return value.toString();
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '[unserializable]';
  }
}
