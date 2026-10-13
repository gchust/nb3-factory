import { useLocale } from '@nocobase/i18n/client';

/** A date and time in the reader's locale, with a missing timestamp showing a dash. */
export function useDateTime(): (
  value: string | Date | null | undefined,
) => string {
  const { locale } = useLocale();
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (value) => {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : formatter.format(date);
  };
}
