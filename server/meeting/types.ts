export interface MeetingRoom {
  readonly id: number;
  readonly name: string;
  readonly capacity: number;
  readonly location: string | null;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type MeetingBookingStatus = 'confirmed' | 'cancelled';

export interface MeetingBooking {
  readonly id: number;
  readonly title: string;
  readonly roomId: number;
  readonly ownerId: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly status: MeetingBookingStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * A room row as it is written. Declared as a `type` rather than an `interface`
 * so it keeps an implied index signature and can be handed to a Repository,
 * whose default record type is `Record<string, ...>`.
 */
export type MeetingRoomWrite = {
  readonly name: string;
  readonly capacity: number;
  readonly location: string | null;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type MeetingRoomInput = Pick<
  MeetingRoomWrite,
  'name' | 'capacity' | 'location' | 'description'
>;

/** A booking row as it is written. Same `type` reasoning as `MeetingRoomWrite`. */
export type MeetingBookingWrite = {
  readonly title: string;
  readonly roomId: number;
  readonly ownerId: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly status: MeetingBookingStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type MeetingBookingInput = Pick<
  MeetingBookingWrite,
  'title' | 'roomId' | 'startAt' | 'endAt'
>;

/** The only mutable part of a booking: cancelling it. */
export type MeetingBookingUpdate = {
  readonly status: MeetingBookingStatus;
  readonly updatedAt: string;
};

export interface TimeRange {
  /** ISO-8601 instant, the inclusive start of the range. */
  readonly startAt: string;
  /** ISO-8601 instant, the exclusive end of the range. */
  readonly endAt: string;
}
