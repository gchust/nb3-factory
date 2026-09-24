import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Minimal document attachment feature (#252).
 *
 * `document_files` is the application-owned file metadata table the File plugin
 * uploads into: the File plugin never creates a Collection, so the application
 * declares the table it stores uploads in. `documents` is the business table
 * this feature is about. `attachmentId` is a scalar uuid with an explicit
 * foreign key so an attachment can be detached (`set null`) without deleting
 * the document it belonged to.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609240001_create_document_attachments',
  async up({ builder }) {
    await builder.createCollection('document_files', (collection) => {
      collection.uuid('id').primary();
      collection.string('disk', { length: 64, nullable: false });
      collection.string('key', { length: 512, nullable: false });
      collection.string('filename', { length: 255, nullable: false });
      collection.string('ext', {
        length: 32,
        nullable: false,
        defaultValue: '',
      });
      collection.string('mimeType', { length: 255, nullable: false });
      collection.integer('size', { nullable: false });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });

    await builder.createCollection('documents', (collection) => {
      collection.uuid('id').primary();
      collection.string('title', { length: 200, nullable: false });
      collection.uuid('attachmentId', { nullable: true });
      collection.foreignKey('attachmentId', {
        references: { collection: 'document_files', fields: ['id'] },
        onDelete: 'set null',
      });
      collection.datetime('createdAt', { nullable: false });
      collection.datetime('updatedAt', { nullable: false });
    });
  },
  async down({ builder }) {
    // The referring table goes first so the foreign key is gone before its target.
    await builder.dropCollection('documents');
    await builder.dropCollection('document_files');
  },
});

export default migration;
