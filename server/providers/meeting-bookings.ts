import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

// `create-app` rewrites this literal to the generated application's own package name. Keeping it alone on one short
// line means the rewrite cannot change how Prettier wraps the statements that use it: a shorter name would otherwise
// let a wrapped call collapse onto one line, leaving the generated project failing its own `pnpm format:check`.
const APP_PACKAGE_NAME = '@nocobase/app-template-default';

export const BOOKING_STATUS_BOOKED = 'booked';
export const BOOKING_STATUS_CANCELLED = 'cancelled';

export type BookingStatus =
  typeof BOOKING_STATUS_BOOKED | typeof BOOKING_STATUS_CANCELLED;

export interface MeetingBooking {
  id: number;
  title: string;
  roomId: number;
  organizer: string;
  startTime: Date;
  endTime: Date;
  notes: string | null;
  status: BookingStatus;
  createdAt: Date;
}

export interface MeetingBookingWithRoom extends MeetingBooking {
  roomName: string;
  roomCode: string;
}

export interface MeetingBookingInput {
  title: string;
  roomId: number;
  organizer: string;
  startTime: Date;
  endTime: Date;
  notes?: string | null;
}

export interface MeetingBookingListFilters {
  roomId?: number;
  /** Local calendar day (YYYY-MM-DD); bookings starting on that day. */
  date?: string;
  /** Case-insensitive substring match on the meeting title. */
  search?: string;
}

export interface MeetingBookingService {
  list(filters: MeetingBookingListFilters): Promise<MeetingBookingWithRoom[]>;
  get(id: number): Promise<MeetingBookingWithRoom | undefined>;
  create(input: MeetingBookingInput): Promise<MeetingBookingWithRoom>;
  cancel(id: number): Promise<MeetingBookingWithRoom | undefined>;
}

export const meetingBookingServiceToken: ServiceToken<MeetingBookingService> =
  createServiceToken<MeetingBookingService>(
    `${APP_PACKAGE_NAME}/meeting-booking-service`,
  );

export class MeetingBookingServiceError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MeetingBookingServiceError';
    this.code = code;
  }
}

export default class MeetingBookingProvider extends ServiceProvider<Application> {
  public readonly name: string = `${APP_PACKAGE_NAME}/meeting-booking-provider`;

  public override register(): void {
    const database = this.app.container.resolve(databaseManagerToken);

    // The SQLite driver returns datetime columns as epoch-millisecond numbers
    // (or Date objects in the in-memory test database), so normalize every
    // date field to a real Date before it leaves the service. Without this the
    // API would serialize numbers and the client's date formatters would crash.
    const toDate = (value: unknown): Date => {
      if (value instanceof Date) return value;
      if (typeof value === 'number') return new Date(value);
      return new Date(String(value));
    };

    const toBooking = (row: Record<string, unknown>): MeetingBooking => ({
      id: Number(row.id),
      title: String(row.title),
      roomId: Number(row.roomId),
      organizer: String(row.organizer),
      startTime: toDate(row.startTime),
      endTime: toDate(row.endTime),
      notes: typeof row.notes === 'string' ? row.notes : null,
      status: String(row.status) as BookingStatus,
      createdAt: toDate(row.createdAt),
    });

    const withRoom = async (
      booking: MeetingBooking,
    ): Promise<MeetingBookingWithRoom> => {
      const room = await database
        .query()
        .selectFrom('meetingRooms')
        .select(['name', 'code'])
        .where('id', '=', booking.roomId)
        .executeTakeFirst<{ name: string; code: string }>();

      return {
        ...booking,
        roomName: room?.name ?? '',
        roomCode: room?.code ?? '',
      };
    };

    const get = async (
      id: number,
    ): Promise<MeetingBookingWithRoom | undefined> => {
      const row = await database
        .query()
        .selectFrom('meetingBookings')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      return row ? withRoom(toBooking(row)) : undefined;
    };

    this.app.container.instance(meetingBookingServiceToken, {
      async list(filters) {
        let query = database
          .query()
          .selectFrom('meetingBookings')
          .selectAll()
          .orderBy('startTime', 'asc');

        if (filters.roomId !== undefined) {
          query = query.where('roomId', '=', filters.roomId);
        }

        if (filters.date) {
          const start = new Date(`${filters.date}T00:00:00`);
          const end = new Date(start);
          end.setDate(end.getDate() + 1);
          query = query
            .where('startTime', '>=', start)
            .where('startTime', '<', end);
        }

        if (filters.search) {
          query = query.where('title', 'like', `%${filters.search}%`);
        }

        const bookings = await query.execute<Record<string, unknown>>();
        return Promise.all(
          bookings.map((booking) => withRoom(toBooking(booking))),
        );
      },

      get,

      async create(input) {
        if (input.endTime.getTime() <= input.startTime.getTime()) {
          throw new MeetingBookingServiceError(
            'INVALID_TIME_RANGE',
            'The end time must be later than the start time.',
          );
        }

        const room = await database
          .query()
          .selectFrom('meetingRooms')
          .select(['id', 'available'])
          .where('id', '=', input.roomId)
          .executeTakeFirst();

        if (!room) {
          throw new MeetingBookingServiceError(
            'ROOM_NOT_FOUND',
            'The meeting room does not exist.',
          );
        }
        if (!room.available) {
          throw new MeetingBookingServiceError(
            'ROOM_UNAVAILABLE',
            'The meeting room is not available for booking.',
          );
        }

        const created = await database.transaction(async (connection) => {
          const overlapping = await connection.query
            .selectFrom('meetingBookings')
            .select('id')
            .where('roomId', '=', input.roomId)
            .where('status', '=', BOOKING_STATUS_BOOKED)
            .where((eb) =>
              eb.and([
                eb('startTime', '<', input.endTime),
                eb('endTime', '>', input.startTime),
              ]),
            )
            .executeTakeFirst();

          if (overlapping) {
            throw new MeetingBookingServiceError(
              'TIME_CONFLICT',
              'The meeting room is already booked for part of the requested time.',
            );
          }

          const result = await connection.query
            .insertInto('meetingBookings')
            .values({
              title: input.title,
              roomId: input.roomId,
              organizer: input.organizer,
              startTime: input.startTime,
              endTime: input.endTime,
              notes: input.notes ?? null,
              status: BOOKING_STATUS_BOOKED,
              createdAt: new Date(),
            })
            .execute();

          const id = Number(result.insertId);
          const booking = await connection.query
            .selectFrom('meetingBookings')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst<Record<string, unknown>>();

          if (!booking) {
            throw new MeetingBookingServiceError(
              'CREATE_FAILED',
              'The booking was not created.',
            );
          }
          return toBooking(booking);
        });

        return withRoom(created);
      },

      async cancel(id) {
        const result = await database
          .query()
          .updateTable('meetingBookings')
          .set({ status: BOOKING_STATUS_CANCELLED })
          .where('id', '=', id)
          .execute();

        if (result.updatedCount === 0) {
          return undefined;
        }

        return get(id);
      },
    } satisfies MeetingBookingService);
  }
}
