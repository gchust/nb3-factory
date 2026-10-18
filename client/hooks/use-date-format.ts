import { useTranslation } from '@nocobase/i18n/client';
import { useMemo } from 'react';

/**
 * Formats the instants the todo and schedule pages show in the reader's language.
 *
 * The API sends ISO 8601 instants, which are unreadable as they are and misleading when formatted in a fixed locale.
 * Both pages show a date and a time, so one hook keeps them consistent instead of each page open-coding
 * `Intl.DateTimeFormat`.
 */
export function useDateFormat(): {
  /** A date and a time of day, in the current UI language. */
  readonly formatDateTime: (value: string | Date) => string;
  /** A date without the time, for a day that is picked rather than recorded. */
  readonly formatDate: (value: string | Date) => string;
} {
  const { i18n } = useTranslation();
  const language = i18n?.language ?? 'en-US';

  return useMemo(() => {
    const dateTime = new Intl.DateTimeFormat(language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const date = new Intl.DateTimeFormat(language, { dateStyle: 'medium' });
    return {
      formatDateTime: (value) =>
        dateTime.format(value instanceof Date ? value : new Date(value)),
      formatDate: (value) =>
        date.format(value instanceof Date ? value : new Date(value)),
    };
  }, [language]);
}
