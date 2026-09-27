import { defineSeed } from '@nocobase/db';
import type { SeedContext } from '@nocobase/db';

/**
 * A small, fixed set of rooms so a fresh installation has somewhere to book.
 * The names are the idempotency key: a second run leaves a room an operator
 * has since renamed or resized alone.
 */
export const EXAMPLE_MEETING_ROOMS: readonly {
  readonly name: string;
  readonly capacity: number;
  readonly location: string;
  readonly description: string;
}[] = [
  {
    name: 'Orchid',
    capacity: 8,
    location: 'Headquarters, 3rd floor, east wing',
    description: 'Whiteboard and video conferencing.',
  },
  {
    name: 'Cedar',
    capacity: 4,
    location: 'Headquarters, 2nd floor, near the atrium',
    description: 'Small room for interviews and one-on-ones.',
  },
  {
    name: 'Summit',
    capacity: 20,
    location: 'Headquarters, 5th floor',
    description: 'Large room with a projector and a speakerphone.',
  },
];

/**
 * Insert any example room that is not there yet, keyed on the room name. Safe
 * to run against a populated database and safe to run twice: it never updates
 * or deletes a row that already exists.
 */
export async function seedMeetingRooms(context: SeedContext): Promise<void> {
  // Bind the context method to keep `this` from being lost at the call site
  // (and to satisfy `@typescript-eslint/unbound-method`).
  const repository = context.repository.bind(context);
  const rooms = repository('meetingRooms');
  const now = new Date().toISOString();
  for (const room of EXAMPLE_MEETING_ROOMS) {
    if (await rooms.exists({ filter: { name: room.name } })) continue;
    await rooms.createOne({
      values: { ...room, createdAt: now, updatedAt: now },
    });
  }
}

const seed = defineSeed({
  name: '202609100003_meeting_rooms_examples',
  run: seedMeetingRooms,
});

export default seed;
