import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Attachment rows for project documents.
 *
 * The column set matches the file plugin's `FILE_COLUMNS` contract, so this
 * Collection can be handed to the plugin's `ServerFileRepository` for uploads,
 * plus the two columns this application adds:
 *
 * - `documentId` is the document an attachment belongs to. It is nullable
 *   because an upload is stored before a document is saved, and it is a plain
 *   column rather than a relation so removing a document is an explicit,
 *   ordered write this application controls.
 * - `ownerId` is stamped by the server on upload and is the row scope used for
 *   every read, so one account can never see another account's attachment.
 *
 * Self-contained by design: no Collection definition, model or registry is
 * imported, so an already-applied migration keeps meaning what it meant.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609100002_create_project_document_files',
  async up({ builder }) {
    await builder.createCollection('project_document_files', (collection) => {
      collection.uuid('id').notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.uuid('documentId').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_project_document_files' });
      collection.index('documentId', {
        name: 'idx_project_document_files_document',
      });
      collection.index('ownerId', {
        name: 'idx_project_document_files_owner',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('project_document_files');
  },
});

export default migration;
