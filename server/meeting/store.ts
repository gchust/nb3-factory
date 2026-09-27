import type {
  DatabaseManager,
  RepositoryPolicy,
  RepositoryRecord,
} from '@nocobase/db';
import { RepositoryError } from '@nocobase/db';
import type {
  MeetingBooking,
  MeetingBookingStatus,
  MeetingBookingUpdate,
  MeetingBookingWrite,
  MeetingRoom,
  MeetingRoomWrite,
  TimeRange,
} from './types.js';

/**
 * The repository policies the request is allowed to use. Built from the
 * authorization decision for one composite action, so a route can never widen
 * what the identity holds.
 */
export interface MeetingAuthorizationPolicies {
  readonly meetingRooms: RepositoryPolicy;
  readonly meetingBookings: RepositoryPolicy;
}

/**
 * Everything the booking service does to storage. The service depends on this
 * interface, not on a Repository, so its logic is testable without a database.
 *
 * `countRoomBookings` and `hasOverlap` are deliberately outside the caller's
 * policy: they answer questions about *other* people's bookings (is this room
 * in use, is this slot taken) and return only a boolean or a count. They never
 * return a row, so they cannot leak a booking the caller may not read.
 */
export interface MeetingBookingStore {
  listRooms(): Promise<MeetingRoom[]>;
  createRoom(values: MeetingRoomWrite): Promise<MeetingRoom>;
  updateRoom(
    id: number,
    values: Partial<MeetingRoomWrite>,
  ): Promise<MeetingRoom | undefined>;
  deleteRoom(id: number): Promise<boolean>;

  listBookings(): Promise<MeetingBooking[]>;
  createBooking(values: MeetingBookingWrite): Promise<MeetingBooking>;
  updateBooking(
    id: number,
    values: MeetingBookingUpdate,
  ): Promise<MeetingBooking | undefined>;

  roomExists(id: number): Promise<boolean>;
  roomNameExists(name: string, exceptId?: number): Promise<boolean>;
  countRoomBookings(roomId: number): Promise<number>;
  hasOverlap(input: TimeRange & { readonly roomId: number }): Promise<boolean>;
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

function asNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : asString(value);
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function serializeRoom(row: RepositoryRecord): MeetingRoom {
  return {
    id: asNumber(row['id']),
    name: asString(row['name']),
    capacity: asNumber(row['capacity']),
    location: asNullableString(row['location']),
    description: asNullableString(row['description']),
    createdAt: asString(row['createdAt']),
    updatedAt: asString(row['updatedAt']),
  };
}

function serializeBooking(row: RepositoryRecord): MeetingBooking {
  return {
    id: asNumber(row['id']),
    title: asString(row['title']),
    roomId: asNumber(row['roomId']),
    ownerId: asString(row['ownerId']),
    startAt: asString(row['startAt']),
    endAt: asString(row['endAt']),
    status: asString(row['status']) as MeetingBookingStatus,
    createdAt: asString(row['createdAt']),
    updatedAt: asString(row['updatedAt']),
  };
}

/** `RECORD_NOT_FOUND` is "this is not yours or it is gone", not a failure. */
function isMissing(error: unknown): boolean {
  return error instanceof RepositoryError && error.code === 'RECORD_NOT_FOUND';
}

/**
 * Builds the store over a real connection. Reads and writes run through the
 * bound policy; the two invariant probes use the unbound repository on
 * purpose, as documented on `MeetingBookingStore`.
 */
export function createRepositoryStore(
  database: DatabaseManager,
  policies: MeetingAuthorizationPolicies,
): MeetingBookingStore {
  const rooms = () =>
    database.repository('meetingRooms').withPolicy(policies.meetingRooms);
  const bookings = () =>
    database.repository('meetingBookings').withPolicy(policies.meetingBookings);

  return {
    async listRooms() {
      const rows = await rooms().findMany({
        sort: (sort) => sort.field('name').asc(),
      });
      return rows.map(serializeRoom);
    },

    async createRoom(values) {
      const result = await rooms().createOne({ values });
      return serializeRoom(result.record);
    },

    async updateRoom(id, values) {
      try {
        const result = await rooms().updateOne({
          filter: { id },
          values,
        });
        return serializeRoom(result.record);
      } catch (error) {
        if (isMissing(error)) return undefined;
        throw error;
      }
    },

    async deleteRoom(id) {
      try {
        await rooms().deleteOne({ filter: { id } });
        return true;
      } catch (error) {
        if (isMissing(error)) return false;
        throw error;
      }
    },

    async listBookings() {
      const rows = await bookings().findMany({
        sort: (sort) => sort.field('startAt').desc(),
      });
      return rows.map(serializeBooking);
    },

    async createBooking(values) {
      const result = await bookings().createOne({ values });
      return serializeBooking(result.record);
    },

    async updateBooking(id, values) {
      try {
        const result = await bookings().updateOne({
          filter: { id },
          values,
        });
        return serializeBooking(result.record);
      } catch (error) {
        if (isMissing(error)) return undefined;
        throw error;
      }
    },

    async roomExists(id) {
      return database.repository('meetingRooms').exists({ filter: { id } });
    },

    async roomNameExists(name, exceptId) {
      return database.repository('meetingRooms').exists({
        filter: (filter) =>
          filter.and([
            filter.string('name').eq(name),
            ...(exceptId === undefined
              ? []
              : [filter.number('id').ne(exceptId)]),
          ]),
      });
    },

    async countRoomBookings(roomId) {
      return database
        .repository('meetingBookings')
        .count({ filter: { roomId } });
    },

    async hasOverlap({ roomId, startAt, endAt }) {
      return database.repository('meetingBookings').exists({
        filter: (filter) =>
          filter.and([
            filter.number('roomId').eq(roomId),
            filter.string('status').ne('cancelled'),
            // Half-open overlap: an existing booking starting before this
            // one ends and ending after this one starts.
            filter.date('startAt').before(endAt),
            filter.date('endAt').after(startAt),
          ]),
      });
    },
  };
}

export { serializeBooking, serializeRoom };
