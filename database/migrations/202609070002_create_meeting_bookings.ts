import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609070002_create_meeting_bookings',

  async up({ builder }) {
    await builder.createCollection('meetingBookings', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.integer('roomId', { nullable: false });
      collection.string('organizer', { length: 128, nullable: false });
      collection.datetime('startTime', { nullable: false });
      collection.datetime('endTime', { nullable: false });
      collection.text('notes', { nullable: true });
      collection.string('status', {
        length: 16,
        nullable: false,
        defaultValue: 'booked',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.foreignKey('roomId', {
        references: { collection: 'meetingRooms', fields: ['id'] },
      });
      collection.index('roomId');
      collection.index('startTime');
      collection.index('status');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('meetingBookings');
  },
});

export default migration;
