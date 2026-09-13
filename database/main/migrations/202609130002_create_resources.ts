import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// One resource has a title, a category and two attachments. The attachment ids reference
// `resource_files`; the file plugin owns the stored bytes and the metadata rows.
const migration: MigrationDefinition = defineMigration({
  name: '202609130002_create_resources',

  async up({ builder }) {
    await builder.createCollection('resources', (collection) => {
      collection.increments('id');
      collection.string('title', { length: 200 }).notNull();
      collection.string('category', { length: 100 }).notNull();
      collection.uuid('coverFileId').nullable();
      collection.uuid('documentFileId').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.index('category');
      collection.index('coverFileId');
      collection.index('documentFileId');
      collection.foreignKey('coverFileId', {
        references: { collection: 'resource_files', fields: ['id'] },
        onDelete: 'set null',
      });
      collection.foreignKey('documentFileId', {
        references: { collection: 'resource_files', fields: ['id'] },
        onDelete: 'set null',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('resources');
  },
});

export default migration;
