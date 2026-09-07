function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Formats a date (ISO string, epoch milliseconds, or Date) as `YYYY-MM-DD HH:mm` in local time. */
export function formatDateTime(value: string | number | Date): string {
  const date = toDate(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Formats a date as `YYYY-MM-DD` in local time. */
export function formatDate(value: string | number | Date): string {
  const date = toDate(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
