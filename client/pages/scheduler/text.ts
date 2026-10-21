import type { OccurrenceStatus, Schedule } from './types.js';

type Translate = (key: string) => string;

const scheduleTitles: Record<string, string> = {
  'app.check-overdue-todos': 'scheduler.checkOverdueTodos.title',
};

const scheduleDescriptions: Record<string, string> = {
  'app.check-overdue-todos': 'scheduler.checkOverdueTodos.description',
};

const targetTitles: Record<string, string> = {
  'app.check-overdue-todos': 'scheduler.checkOverdueTodos.target',
};

export function scheduleTitle(schedule: Schedule, t: Translate): string {
  const key = scheduleTitles[schedule.key];
  return key ? t(key) : schedule.title;
}

export function scheduleDescription(schedule: Schedule, t: Translate): string {
  const key = scheduleDescriptions[schedule.key];
  return key ? t(key) : (schedule.description ?? t('scheduler.noDescription'));
}

export function targetTitle(schedule: Schedule, t: Translate): string {
  const key = targetTitles[schedule.targetType];
  return key ? t(key) : schedule.targetSummary.targetLabel;
}

export function formatDateTime(value: string | undefined, language: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export const occurrenceTone: Record<
  OccurrenceStatus,
  'neutral' | 'info' | 'warning' | 'success'
> = {
  pending: 'neutral',
  running: 'info',
  waiting: 'info',
  succeeded: 'success',
  failed: 'warning',
  skipped: 'neutral',
  cancelled: 'neutral',
  timed_out: 'warning',
  triggered: 'info',
};
