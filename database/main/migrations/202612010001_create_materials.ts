import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The materials a user may read through the assistant.
 *
 * `visibility` is a business field, not authorization state: `public` is readable by every colleague, `restricted`
 * only by a supervisor. It is declared here rather than derived so the supervisor can change it from the UI.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202612010001_create_materials',

  async up({ builder }) {
    await builder.createCollection('materials', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 255, nullable: false });
      collection.text('body', { nullable: false });
      collection.string('visibility', {
        length: 32,
        nullable: false,
        defaultValue: 'public',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
      collection.index('visibility');
    });
  },

  async down({ builder }) {
    await builder.dropCollection('materials');
  },
});

export default migration;
