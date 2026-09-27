import type {
  MeetingBookingInput,
  MeetingRoomInput,
  TimeRange,
} from './types.js';

/** Errors the domain raises; the HTTP layer maps `code` to a status. */
export type MeetingBookingErrorCode =
  | 'INVALID_ROOM'
  | 'INVALID_BOOKING'
  | 'INVALID_TIME_RANGE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_NAME_TAKEN'
  | 'ROOM_IN_USE'
  | 'BOOKING_NOT_FOUND'
  | 'BOOKING_CONFLICT';

export class MeetingBookingError extends Error {
  public readonly code: MeetingBookingErrorCode;

  constructor(code: MeetingBookingErrorCode, message: string) {
    super(message);
    this.name = 'MeetingBookingError';
    this.code = code;
  }
}

const pad = (part: number, width = 2): string =>
  String(part).padStart(width, '0');

/**
 * Renders an instant as the `datetime` field stores it: the host's wall-clock
 * reading, fixed-width to the millisecond. This is the same rendering the
 * database layer applies, so a value written through the API and the value
 * compared during the overlap probe are the same text.
 */
export function formatInstant(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
  return `${day}T${clock}`;
}

/** Now, in the wall-clock shape the domain and the database agree on. */
export function nowInstant(): string {
  return formatInstant(new Date());
}

const OFFSET_SUFFIX = /(Z|[+-]\d{2}:\d{2})$/;
const WALL_CLOCK =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

/**
 * Parses one instant into a canonical `YYYY-MM-DDTHH:mm:ss.SSS` wall-clock
 * string.
 *
 * A value carrying a zone offset names an absolute instant; it is read and
 * rendered on the host's clock, exactly as the database does before storing
 * it. A value without an offset is already the wall-clock reading and is kept
 * as written, so a meeting at 10:00 stays at 10:00 wherever the server runs.
 *
 * The fixed-width form is also the reason the overlap probe and the unit-level
 * overlap check can compare these strings directly: lexicographic order equals
 * chronological order.
 */
export function parseInstant(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new MeetingBookingError(
      'INVALID_TIME_RANGE',
      'A start and an end time are required.',
    );
  }
  const text = value.trim();
  if (OFFSET_SUFFIX.test(text)) {
    const instant = new Date(text);
    if (Number.isNaN(instant.getTime())) {
      throw new MeetingBookingError(
        'INVALID_TIME_RANGE',
        'A time value could not be parsed.',
      );
    }
    return formatInstant(instant);
  }

  const match = WALL_CLOCK.exec(text);
  if (!match) {
    throw new MeetingBookingError(
      'INVALID_TIME_RANGE',
      'A time value could not be parsed.',
    );
  }
  const [, year, month, day, hour, minute, second = '00', fraction = '0'] =
    match;
  const numbers = [year, month, day, hour, minute, second].map(Number);
  const calendar = new Date(Date.UTC(numbers[0], numbers[1] - 1, numbers[2]));
  const validCalendar =
    calendar.getUTCFullYear() === numbers[0] &&
    calendar.getUTCMonth() === numbers[1] - 1 &&
    calendar.getUTCDate() === numbers[2];
  if (
    numbers[0] < 1000 ||
    numbers[0] > 9999 ||
    !validCalendar ||
    numbers[3] > 23 ||
    numbers[4] > 59 ||
    numbers[5] > 59
  ) {
    throw new MeetingBookingError(
      'INVALID_TIME_RANGE',
      'A time value could not be parsed.',
    );
  }
  const milliseconds = fraction.padEnd(3, '0');
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${milliseconds}`;
}

/** Requires `endAt` to be strictly after `startAt`; returns canonical instants. */
export function assertValidTimeRange(
  startAt: unknown,
  endAt: unknown,
): TimeRange {
  const start = parseInstant(startAt);
  const end = parseInstant(endAt);
  if (end <= start) {
    throw new MeetingBookingError(
      'INVALID_TIME_RANGE',
      'The end time must be after the start time.',
    );
  }
  return { endAt: end, startAt: start };
}

/**
 * Half-open interval overlap: `[s1, e1)` and `[s2, e2)` overlap when
 * `s1 < e2` and `e1 > s2`. Touching intervals do not overlap, so a meeting
 * that ends at 11:00 does not conflict with one that starts at 11:00.
 */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startAt < b.endAt && a.endAt > b.startAt;
}

/** A non-empty, trimmed string or `undefined`. */
function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function requiredString(value: unknown, code: MeetingBookingErrorCode): string {
  const parsed = optionalString(value);
  if (parsed === undefined) {
    throw new MeetingBookingError(code, 'A non-empty string is required.');
  }
  return parsed;
}

function positiveInteger(
  value: unknown,
  code: MeetingBookingErrorCode,
  field: string,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new MeetingBookingError(code, `${field} must be a positive integer.`);
  }
  return parsed;
}

/** Validates a room create/update payload into the domain shape. */
export function parseRoomInput(value: unknown): MeetingRoomInput {
  if (typeof value !== 'object' || value === null) {
    throw new MeetingBookingError('INVALID_ROOM', 'A room body is required.');
  }
  const record = value as Record<string, unknown>;
  return {
    name: requiredString(record['name'], 'INVALID_ROOM'),
    capacity:
      record['capacity'] === undefined || record['capacity'] === null
        ? 1
        : positiveInteger(record['capacity'], 'INVALID_ROOM', 'capacity'),
    location: optionalString(record['location']) ?? null,
    description: optionalString(record['description']) ?? null,
  };
}

/**
 * Validates a booking payload. `ownerId` is deliberately absent: it is taken
 * from the authenticated principal, never from the request body.
 */
export function parseBookingInput(value: unknown): MeetingBookingInput {
  if (typeof value !== 'object' || value === null) {
    throw new MeetingBookingError(
      'INVALID_BOOKING',
      'A booking body is required.',
    );
  }
  const record = value as Record<string, unknown>;
  const range = assertValidTimeRange(record['startAt'], record['endAt']);
  return {
    roomId: positiveInteger(record['roomId'], 'INVALID_BOOKING', 'roomId'),
    startAt: range.startAt,
    endAt: range.endAt,
    title: requiredString(record['title'], 'INVALID_BOOKING'),
  };
}
