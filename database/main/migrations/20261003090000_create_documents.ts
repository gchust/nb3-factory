import { defineMigration } from '@nocobase/db';
import type { MigrationDefinition } from '@nocobase/db';

/**
 * Application-owned table for the internal read-only document assistant.
 *
 * `accessLevel` is `public` (readable by every signed-in user) or
 * `supervisor` (readable only by users assigned the `supervisor` permission
 * set). Access control is enforced in `server/providers/documents.ts`, never in
 * the browser, so a direct read of a `supervisor` document is refused for a
 * regular colleague even when they call the API directly.
 *
 * This migration is immutable history: it spells out every field, index and
 * constraint so it never depends on a collection definition that keeps
 * evolving.
 */
const migration: MigrationDefinition = defineMigration({
  name: '20261003090000_create_documents',
  async up({ builder }) {
    await builder.createCollection('documents', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('title', { length: 255 }).notNull();
      collection.text('content').notNull();
      collection
        .string('accessLevel', { length: 32 })
        .notNull()
        .defaultTo('public');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_documents' });
      collection.index('accessLevel', { name: 'idx_documents_access_level' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('documents');
  },
});

export default migration;
