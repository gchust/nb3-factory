import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609130001_create_announcements',

  async up({ builder }) {
    await builder.createCollection('announcements', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200, nullable: false });
      collection.text('body', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      // The list is always read newest-first, so the sort column is indexed.
      collection.index('createdAt');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('announcements');
  },
});

export default migration;
