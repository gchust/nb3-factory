import { defineMigration } from '@nocobase/db';

// Hand-written for the meeting-room booking feature. Every field, index and
// constraint is spelled out here so this migration keeps meaning the same
// thing after the application's Collection metadata moves on.
const migration = defineMigration({
  name: '202609100001_create_meeting_rooms',
  async up({ builder }) {
    await builder.createCollection('meetingRooms', (collection) => {
      collection.increments('id');
      collection.string('name', { length: 128 }).notNull();
      collection.integer('capacity', { defaultValue: 1 }).notNull();
      collection.string('location', { length: 255 }).nullable();
      collection.text('description').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_meeting_rooms' });
      collection.unique('name', { name: 'uq_meeting_rooms_name' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('meetingRooms');
  },
});

export default migration;
