import {
  MeetingBookingError,
  nowInstant,
  parseBookingInput,
  parseRoomInput,
} from './domain.js';
import type { MeetingBookingStore } from './store.js';
import type { MeetingBooking, MeetingRoom } from './types.js';

/**
 * The meeting-room booking rules, independent of HTTP and of the storage
 * engine. The store is injected, so the overlap and ownership rules can be
 * exercised against an in-memory implementation as well as a real database.
 */
export class MeetingBookingService {
  constructor(
    private readonly store: MeetingBookingStore,
    private readonly now: () => string = nowInstant,
  ) {}

  listRooms(): Promise<MeetingRoom[]> {
    return this.store.listRooms();
  }

  async createRoom(input: unknown): Promise<MeetingRoom> {
    const values = parseRoomInput(input);
    if (await this.store.roomNameExists(values.name)) {
      throw new MeetingBookingError(
        'ROOM_NAME_TAKEN',
        'A room with this name already exists.',
      );
    }
    const timestamp = this.now();
    return this.store.createRoom({
      ...values,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  async updateRoom(id: number, input: unknown): Promise<MeetingRoom> {
    const values = parseRoomInput(input);
    if (!(await this.store.roomExists(id))) {
      throw new MeetingBookingError(
        'ROOM_NOT_FOUND',
        'The room does not exist.',
      );
    }
    if (await this.store.roomNameExists(values.name, id)) {
      throw new MeetingBookingError(
        'ROOM_NAME_TAKEN',
        'A room with this name already exists.',
      );
    }
    const updated = await this.store.updateRoom(id, {
      ...values,
      updatedAt: this.now(),
    });
    if (!updated) {
      throw new MeetingBookingError(
        'ROOM_NOT_FOUND',
        'The room does not exist.',
      );
    }
    return updated;
  }

  /**
   * A room that still has any booking — cancelled ones included, because they
   * still reference it — is refused rather than left to the foreign key.
   */
  async deleteRoom(id: number): Promise<void> {
    if (!(await this.store.roomExists(id))) {
      throw new MeetingBookingError(
        'ROOM_NOT_FOUND',
        'The room does not exist.',
      );
    }
    if ((await this.store.countRoomBookings(id)) > 0) {
      throw new MeetingBookingError(
        'ROOM_IN_USE',
        'The room still has bookings and cannot be deleted.',
      );
    }
    if (!(await this.store.deleteRoom(id))) {
      throw new MeetingBookingError(
        'ROOM_NOT_FOUND',
        'The room does not exist.',
      );
    }
  }

  listBookings(): Promise<MeetingBooking[]> {
    return this.store.listBookings();
  }

  /**
   * `ownerId` comes from the authenticated principal. The overlap probe reads
   * the room's whole booking history, which is the point: two employees must
   * not be able to double-book the same slot.
   */
  async createBooking(
    input: unknown,
    ownerId: string,
  ): Promise<MeetingBooking> {
    const values = parseBookingInput(input);
    if (!(await this.store.roomExists(values.roomId))) {
      throw new MeetingBookingError(
        'ROOM_NOT_FOUND',
        'The room does not exist.',
      );
    }
    if (await this.store.hasOverlap(values)) {
      throw new MeetingBookingError(
        'BOOKING_CONFLICT',
        'Another booking already covers this room and time.',
      );
    }
    const timestamp = this.now();
    return this.store.createBooking({
      ...values,
      ownerId,
      status: 'confirmed',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  /**
   * Cancelling is a soft state change. The update policy is scoped to the
   * owner's rows, so someone else's booking simply does not match and is
   * reported as not found rather than as forbidden.
   */
  async cancelBooking(id: number): Promise<MeetingBooking> {
    const updated = await this.store.updateBooking(id, {
      status: 'cancelled',
      updatedAt: this.now(),
    });
    if (!updated) {
      throw new MeetingBookingError(
        'BOOKING_NOT_FOUND',
        'The booking does not exist.',
      );
    }
    return updated;
  }
}
