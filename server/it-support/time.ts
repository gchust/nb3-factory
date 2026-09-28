/**
 * Renders an instant the way a `datetime` Field stores it.
 *
 * `datetime` is a wall-clock type in this database layer: a `Date` handed to
 * the Repository is rendered with the host's local reading, and the value read
 * back is that same text. Writing the text directly keeps the mutation input
 * type honest (`string`, not `Date`) and keeps a migration seed and a route
 * producing byte-identical timestamps.
 */
export function wallClock(date: Date): string {
  const pad = (value: number, length: number = 2): string =>
    String(value).padStart(length, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
  return `${day}T${clock}`;
}
