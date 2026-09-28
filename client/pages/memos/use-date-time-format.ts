import { useLocale } from '@nocobase/i18n/client';
import { useMemo } from 'react';

/** Formats a memo's created time in the language the user is viewing, following a language switch. */
export function useDateTimeFormat(): Intl.DateTimeFormat {
  const { locale } = useLocale();
  return useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
}
