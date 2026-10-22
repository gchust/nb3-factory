export const statusTone = (
  status: string,
): 'neutral' | 'info' | 'warning' | 'success' =>
  status === 'open'
    ? 'warning'
    : status === 'processing'
      ? 'info'
      : status === 'resolved'
        ? 'success'
        : 'neutral';

export const priorityTone = (
  priority: string,
): 'neutral' | 'info' | 'warning' | 'success' =>
  priority === 'urgent' ? 'warning' : priority === 'high' ? 'info' : 'neutral';

export const formatDateTime = (
  value: string | null | undefined,
  language: string,
): string =>
  value
    ? new Intl.DateTimeFormat(language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—';
