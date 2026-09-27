/** Date helpers shared by the visitor pages. They hold no React and export no component. */

/** `datetime-local` inputs read and write `yyyy-MM-ddTHH:mm` in local time. */
export function toDateTimeLocal(value: Date): string {
  const pad = (part: number): string => String(part).padStart(2, '0');
  const date = [
    value.getFullYear(),
    pad(value.getMonth() + 1),
    pad(value.getDate()),
  ].join('-');
  return `${date}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

/** An ISO instant for the API, or undefined when the input is not a valid date. */
export function toInstant(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const instant = Date.parse(value);
  return Number.isNaN(instant) ? undefined : new Date(instant).toISOString();
}

/** A `yyyy-MM-dd` query parameter, read as a local calendar day. */
export function parseDayParam(value: string | null): Date | undefined {
  if (!value) {
    return undefined;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) {
    return undefined;
  }
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}
