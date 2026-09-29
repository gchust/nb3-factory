import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Project document headers.
 *
 * A document is a title plus the attachment rows that point at it. `ownerId` is
 * the account that created it and is the only row-scope this first version
 * enforces: a document is readable and writable by its owner and nobody else.
 *
 * Self-contained by design: no Collection definition, model or registry is
 * imported, so an already-applied migration keeps meaning what it meant.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609100001_create_project_documents',
  async up({ builder }) {
    await builder.createCollection('project_documents', (collection) => {
      collection.uuid('id').notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_project_documents' });
      collection.index('ownerId', { name: 'idx_project_documents_owner' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('project_documents');
  },
});

export default migration;
