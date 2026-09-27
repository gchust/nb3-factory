import { format, parseISO } from 'date-fns';
import type { Locale } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';

/**
 * Rendering and input conversion for the meeting feature's wall-clock times.
 *
 * The server stores times without a zone, fixed to the millisecond, and reads a
 * `datetime-local` value as exactly the same wall clock. The browser input and
 * the API therefore agree once the seconds and milliseconds the input omits are
 * supplied, which `toInputValue` and `fromInputValue` handle in one place.
 */

/** A `datetime-local` input shows `YYYY-MM-DDTHH:mm`, so trim the stored precision. */
export function toInputValue(value: string): string {
  return value.slice(0, 16);
}

/** A `datetime-local` value gains the seconds and milliseconds the stored shape requires. */
export function fromInputValue(value: string): string {
  return value.length === 16 ? `${value}:00.000` : value;
}

/** A sensible starting point for a new booking: the next whole hour from now. */
export function nextHourInput(): string {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  return format(start, "yyyy-MM-dd'T'HH:mm");
}

/** One hour after a `datetime-local` value, used as the default end time. */
export function oneHourLater(value: string): string {
  const start = parseISO(value);
  if (Number.isNaN(start.getTime())) return value;
  return format(
    new Date(start.getTime() + 60 * 60 * 1000),
    "yyyy-MM-dd'T'HH:mm",
  );
}

/** The `date-fns` locale for a UI language, so a month and weekday name follow the user. */
export function dateLocaleFor(language: string): Locale {
  return language.startsWith('zh') ? zhCN : enUS;
}

/** A stored instant as a readable local date and time. */
export function formatInstant(value: string, locale: Locale): string {
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? value : format(date, 'PPp', { locale });
}
