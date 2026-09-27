// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MeetingBookingError,
  assertValidTimeRange,
  formatInstant,
  parseBookingInput,
  parseInstant,
  parseRoomInput,
  rangesOverlap,
} from '../../server/meeting/domain.js';
import { MeetingBookingService } from '../../server/meeting/service.js';
import type { MeetingBookingStore } from '../../server/meeting/store.js';
import type {
  MeetingBooking,
  MeetingBookingUpdate,
  MeetingBookingWrite,
  MeetingRoom,
  MeetingRoomWrite,
} from '../../server/meeting/types.js';

const NOW = '2026-09-10T09:00:00.000';

/** An in-memory store so the service rules can be exercised without a database. */
class FakeStore implements MeetingBookingStore {
  readonly rooms: MeetingRoom[] = [];
  readonly bookings: MeetingBooking[] = [];
  private roomId = 1;
  private bookingId = 1;

  listRooms(): Promise<MeetingRoom[]> {
    return Promise.resolve([...this.rooms]);
  }

  createRoom(values: MeetingRoomWrite): Promise<MeetingRoom> {
    const room: MeetingRoom = { ...values, id: this.roomId++ };
    this.rooms.push(room);
    return Promise.resolve(room);
  }

  updateRoom(
    id: number,
    values: Partial<MeetingRoomWrite>,
  ): Promise<MeetingRoom | undefined> {
    const room = this.rooms.find((entry) => entry.id === id);
    if (!room) return Promise.resolve(undefined);
    Object.assign(room, values);
    return Promise.resolve(room);
  }

  deleteRoom(id: number): Promise<boolean> {
    const index = this.rooms.findIndex((entry) => entry.id === id);
    if (index < 0) return Promise.resolve(false);
    this.rooms.splice(index, 1);
    return Promise.resolve(true);
  }

  listBookings(): Promise<MeetingBooking[]> {
    return Promise.resolve([...this.bookings]);
  }

  createBooking(values: MeetingBookingWrite): Promise<MeetingBooking> {
    const booking: MeetingBooking = { ...values, id: this.bookingId++ };
    this.bookings.push(booking);
    return Promise.resolve(booking);
  }

  updateBooking(
    id: number,
    values: MeetingBookingUpdate,
  ): Promise<MeetingBooking | undefined> {
    const booking = this.bookings.find((entry) => entry.id === id);
    if (!booking) return Promise.resolve(undefined);
    Object.assign(booking, values);
    return Promise.resolve(booking);
  }

  roomExists(id: number): Promise<boolean> {
    return Promise.resolve(this.rooms.some((entry) => entry.id === id));
  }

  roomNameExists(name: string, exceptId?: number): Promise<boolean> {
    return Promise.resolve(
      this.rooms.some((entry) => entry.name === name && entry.id !== exceptId),
    );
  }

  countRoomBookings(roomId: number): Promise<number> {
    return Promise.resolve(
      this.bookings.filter((entry) => entry.roomId === roomId).length,
    );
  }

  hasOverlap(input: {
    readonly roomId: number;
    readonly startAt: string;
    readonly endAt: string;
  }): Promise<boolean> {
    return Promise.resolve(
      this.bookings.some(
        (entry) =>
          entry.roomId === input.roomId &&
          entry.status !== 'cancelled' &&
          rangesOverlap(entry, input),
      ),
    );
  }
}

function createService(): { store: FakeStore; service: MeetingBookingService } {
  const store = new FakeStore();
  return { store, service: new MeetingBookingService(store, () => NOW) };
}

async function seedRoom(
  store: FakeStore,
  values: Partial<MeetingRoom> = {},
): Promise<MeetingRoom> {
  return store.createRoom({
    name: 'Orchid',
    capacity: 8,
    location: null,
    description: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...values,
  });
}

describe('meeting time values', () => {
  it('normalizes a wall-clock value to the fixed-width stored form', () => {
    expect(parseInstant('2026-09-10T10:00')).toBe('2026-09-10T10:00:00.000');
    expect(parseInstant('2026-09-10 10:00:30')).toBe('2026-09-10T10:00:30.000');
    expect(parseInstant('2026-09-10T10:00:30.5')).toBe(
      '2026-09-10T10:00:30.500',
    );
  });

  it('renders an offset-bearing instant on the host clock', () => {
    const text = '2026-09-10T08:00:00.000Z';
    expect(parseInstant(text)).toBe(formatInstant(new Date(text)));
  });

  it('rejects values that are not a time', () => {
    for (const value of [
      '',
      '   ',
      'tomorrow',
      '2026-13-01T10:00',
      undefined,
    ]) {
      expect(() => parseInstant(value)).toThrow(MeetingBookingError);
    }
  });

  it('requires the end to be strictly after the start', () => {
    expect(
      assertValidTimeRange('2026-09-10T10:00', '2026-09-10T11:00'),
    ).toEqual({
      startAt: '2026-09-10T10:00:00.000',
      endAt: '2026-09-10T11:00:00.000',
    });
    expect(() =>
      assertValidTimeRange('2026-09-10T10:00', '2026-09-10T10:00'),
    ).toThrow(MeetingBookingError);
    expect(() =>
      assertValidTimeRange('2026-09-10T11:00', '2026-09-10T10:00'),
    ).toThrow(MeetingBookingError);
  });

  it('treats touching ranges as not overlapping', () => {
    const first = {
      startAt: '2026-09-10T10:00:00.000',
      endAt: '2026-09-10T11:00:00.000',
    };
    const next = {
      startAt: '2026-09-10T11:00:00.000',
      endAt: '2026-09-10T12:00:00.000',
    };
    const inside = {
      startAt: '2026-09-10T10:30:00.000',
      endAt: '2026-09-10T10:45:00.000',
    };
    expect(rangesOverlap(first, next)).toBe(false);
    expect(rangesOverlap(first, inside)).toBe(true);
  });
});

describe('meeting input parsing', () => {
  it('trims a room name and defaults the capacity', () => {
    expect(parseRoomInput({ name: '  Orchid  ' })).toEqual({
      name: 'Orchid',
      capacity: 1,
      location: null,
      description: null,
    });
  });

  it('rejects a room without a name or with a non-positive capacity', () => {
    expect(() => parseRoomInput({ name: '   ' })).toThrow(MeetingBookingError);
    expect(() => parseRoomInput({ name: 'Orchid', capacity: 0 })).toThrow(
      MeetingBookingError,
    );
  });

  it('never takes the owner from the booking body', () => {
    const parsed = parseBookingInput({
      title: 'Standup',
      roomId: '2',
      startAt: '2026-09-10T10:00',
      endAt: '2026-09-10T11:00',
      ownerId: 'someone-else',
      status: 'cancelled',
    });
    expect(parsed).toEqual({
      title: 'Standup',
      roomId: 2,
      startAt: '2026-09-10T10:00:00.000',
      endAt: '2026-09-10T11:00:00.000',
    });
    expect(parsed).not.toHaveProperty('ownerId');
    expect(parsed).not.toHaveProperty('status');
  });
});

describe('MeetingBookingService', () => {
  it('refuses a second room with the same name', async () => {
    const { service } = createService();
    await service.createRoom({ name: 'Orchid' });
    await expect(service.createRoom({ name: 'Orchid' })).rejects.toMatchObject({
      code: 'ROOM_NAME_TAKEN',
    });
  });

  it('renames a room without colliding with itself', async () => {
    const { service } = createService();
    const room = await service.createRoom({ name: 'Orchid' });
    await expect(
      service.updateRoom(room.id, { name: 'Orchid', capacity: 12 }),
    ).resolves.toMatchObject({ name: 'Orchid', capacity: 12 });
  });

  it('reports an unknown room as not found on update and delete', async () => {
    const { service } = createService();
    await expect(
      service.updateRoom(999, { name: 'Ghost' }),
    ).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' });
    await expect(service.deleteRoom(999)).rejects.toMatchObject({
      code: 'ROOM_NOT_FOUND',
    });
  });

  it('refuses to delete a room that still has bookings', async () => {
    const { store, service } = createService();
    const room = await seedRoom(store);
    await service.createBooking(
      {
        title: 'Standup',
        roomId: room.id,
        startAt: '2026-09-10T10:00',
        endAt: '2026-09-10T11:00',
      },
      'user-1',
    );
    await expect(service.deleteRoom(room.id)).rejects.toMatchObject({
      code: 'ROOM_IN_USE',
    });
  });

  it('refuses a booking that overlaps another in the same room', async () => {
    const { store, service } = createService();
    const room = await seedRoom(store);
    const other = await seedRoom(store, { name: 'Cedar' });
    await service.createBooking(
      {
        title: 'Standup',
        roomId: room.id,
        startAt: '2026-09-10T10:00',
        endAt: '2026-09-10T11:00',
      },
      'user-1',
    );
    // Touching the first booking's end is allowed.
    await expect(
      service.createBooking(
        {
          title: 'Review',
          roomId: room.id,
          startAt: '2026-09-10T11:00',
          endAt: '2026-09-10T12:00',
        },
        'user-2',
      ),
    ).resolves.toMatchObject({ status: 'confirmed' });
    // The same slot in another room is allowed.
    await expect(
      service.createBooking(
        {
          title: 'Interview',
          roomId: other.id,
          startAt: '2026-09-10T10:30',
          endAt: '2026-09-10T11:30',
        },
        'user-2',
      ),
    ).resolves.toMatchObject({ status: 'confirmed' });
    // Overlapping inside the first booking is refused.
    await expect(
      service.createBooking(
        {
          title: 'Clash',
          roomId: room.id,
          startAt: '2026-09-10T10:30',
          endAt: '2026-09-10T10:45',
        },
        'user-3',
      ),
    ).rejects.toMatchObject({ code: 'BOOKING_CONFLICT' });
  });

  it('frees a slot once its booking is cancelled', async () => {
    const { store, service } = createService();
    const room = await seedRoom(store);
    const first = await service.createBooking(
      {
        title: 'Standup',
        roomId: room.id,
        startAt: '2026-09-10T10:00',
        endAt: '2026-09-10T11:00',
      },
      'user-1',
    );
    const cancelled = await service.cancelBooking(first.id);
    expect(cancelled.status).toBe('cancelled');
    await expect(
      service.createBooking(
        {
          title: 'Replacement',
          roomId: room.id,
          startAt: '2026-09-10T10:00',
          endAt: '2026-09-10T11:00',
        },
        'user-2',
      ),
    ).resolves.toMatchObject({ status: 'confirmed' });
  });

  it('reports a booking outside the caller scope as not found', async () => {
    const { service } = createService();
    await expect(service.cancelBooking(42)).rejects.toMatchObject({
      code: 'BOOKING_NOT_FOUND',
    });
  });

  it('records the owner from the principal and the injected clock', async () => {
    const { service } = createService();
    const room = await service.createRoom({ name: 'Orchid' });
    const booking = await service.createBooking(
      {
        title: 'Standup',
        roomId: room.id,
        startAt: '2026-09-10T10:00',
        endAt: '2026-09-10T11:00',
        ownerId: 'someone-else',
      } as unknown,
      'user-1',
    );
    expect(booking.ownerId).toBe('user-1');
    expect(booking.createdAt).toBe(NOW);
    expect(booking.updatedAt).toBe(NOW);
    expect(booking.status).toBe('confirmed');
  });
});
