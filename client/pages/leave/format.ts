import { parseISO } from 'date-fns';

/** A stored calendar date as a local day; never shift it through UTC. */
export function calendarDate(value: string): Date {
  return parseISO(value);
}

export function formatDay(value: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function formatInstant(value: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function dateRange(
  startDate: string,
  endDate: string,
  language: string,
): string {
  return startDate === endDate
    ? formatDay(startDate, language)
    : `${formatDay(startDate, language)} – ${formatDay(endDate, language)}`;
}

/** ISO day for a calendar cell, using local date parts rather than UTC. */
export function isoDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Working days inclusive of both ends, in the browser's calendar. */
export function workingDaysBetween(startDate: string, endDate: string): number {
  if (!startDate || !endDate || endDate < startDate) return 0;
  const start = calendarDate(startDate);
  const end = calendarDate(endDate);
  let days = 0;
  for (
    let cursor = start;
    cursor.getTime() <= end.getTime();
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 1,
    )
  ) {
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}
