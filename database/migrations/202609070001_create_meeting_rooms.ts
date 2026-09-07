import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609070001_create_meeting_rooms',

  async up({ builder }) {
    await builder.createCollection('meetingRooms', (collection) => {
      collection.increments('id');
      collection.string('code', { length: 32, nullable: false });
      collection.string('name', { length: 128, nullable: false });
      collection.string('location', { length: 255, nullable: false });
      collection.integer('capacity', { nullable: false });
      collection.text('equipment', { nullable: true });
      collection.boolean('available', {
        nullable: false,
        defaultValue: true,
      });
      collection.datetime('createdAt', { nullable: false });
      collection.unique('code');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('meetingRooms');
  },
});

export default migration;
