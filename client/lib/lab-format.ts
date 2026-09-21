/**
 * Turning stored values into the text a table shows.
 *
 * The server stores and returns an absolute instant; the sentence the viewer reads names it in their
 * own time zone, and a field that was never filled in is a dash rather than "Invalid Date".
 */
import type { Translate } from './lab-options.js';

export function formatMoment(
  t: Translate,
  value: string | null | undefined,
): string {
  if (!value) return t('lab.unset');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t('lab.unset') : date.toLocaleString();
}

/** The same instant as a date without the time. */
export function formatDay(
  t: Translate,
  value: string | null | undefined,
): string {
  if (!value) return t('lab.unset');
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? t('lab.unset')
    : date.toLocaleDateString();
}
