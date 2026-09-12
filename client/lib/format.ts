import dayjs from 'dayjs';

/** Formats a stored date into the `YYYY-MM-DD HH:mm` display shape. */
export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return dayjs(date).format('YYYY-MM-DD HH:mm');
}

/** Renders a Date as a value for an `<input type="datetime-local">`. */
export function toDateTimeLocal(value: Date): string {
  return dayjs(value).format('YYYY-MM-DDTHH:mm');
}

/** Parses a datetime-local input value (local time) into an ISO string. */
export function fromDateTimeLocal(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
