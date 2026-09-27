/**
 * The meeting feature's client-side types. They mirror the shapes the server
 * routes return; the client keeps its own copy rather than importing from
 * `server/`, so no server module is pulled into the browser bundle.
 */

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

/** The writable part of a room the create/edit dialog sends. */
export interface MeetingRoomInput {
  readonly name: string;
  readonly capacity: number;
  readonly location: string | null;
  readonly description: string | null;
}

/** The writable part of a booking the create dialog sends. */
export interface MeetingBookingInput {
  readonly title: string;
  readonly roomId: number;
  readonly startAt: string;
  readonly endAt: string;
}
