import { defineMigration } from '@nocobase/db';

/**
 * The document library's own table.
 *
 * `ownerId` is a plain column rather than a relation: the owner is only ever
 * compared in a filter, never included, so a relation would add a write path
 * and a policy branch for nothing. Every column the library reads is spelled
 * out here so a later change to a shared definition cannot alter this history.
 */
const migration = defineMigration({
  name: '202609280001_create_documents',
  async up({ builder }) {
    await builder.createCollection('documents', (collection) => {
      collection.uuid('id').primary();
      collection.string('title', { length: 255 }).notNull();
      collection.text('body').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.boolean('published', { defaultValue: false }).notNull();
      collection.boolean('confidential', { defaultValue: false }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.index('ownerId', { name: 'idx_documents_owner' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('documents');
  },
});

export default migration;
