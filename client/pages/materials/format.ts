/**
 * A date-time as the current language writes it. The application's locale is
 * passed in rather than left to the browser, so the column follows the language
 * the user picked instead of the operating system's.
 */
export function formatDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
