import { defineMigration } from '@nocobase/db';

// Bookings reference a room and the signed-in user who made them. `status`
// separates a cancelled booking from an active one; a cancellation is a soft
// state change so the history stays readable and overlap detection can ignore
// it.
const migration = defineMigration({
  name: '202609100002_create_meeting_bookings',
  async up({ builder }) {
    await builder.createCollection('meetingBookings', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255 }).notNull();
      collection.integer('roomId').notNull();
      collection.string('ownerId', { length: 255 }).notNull();
      collection.datetime('startAt').notNull();
      collection.datetime('endAt').notNull();
      collection
        .string('status', { length: 32, defaultValue: 'confirmed' })
        .notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_meeting_bookings' });
      collection.foreignKey('roomId', {
        name: 'fk_meeting_bookings_room',
        references: { collection: 'meetingRooms', fields: ['id'] },
      });
      // The overlap probe always filters by room and compares the two times.
      collection.index(['roomId', 'startAt', 'endAt'], {
        name: 'idx_meeting_bookings_room_time',
      });
      // "My bookings" reads by owner.
      collection.index('ownerId', { name: 'idx_meeting_bookings_owner' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('meetingBookings');
  },
});

export default migration;
