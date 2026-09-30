import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * File collection backing ticket attachments and manual documents. The file
 * plugin requires the fixed metadata columns; the business columns
 * (ticketId/manualId/category/uploadedById) are stamped by the App's own upload
 * route after the file record exists.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609100004_create_service_attachments',
  async up({ builder }) {
    await builder.createCollection(
      'serviceAttachments',
      (collection) => {
        collection.uuid('id').primary().notNull();
        collection.string('disk', { length: 255 }).notNull();
        collection.text('key').notNull();
        collection.text('filename').notNull();
        collection.string('ext', { length: 32 }).notNull();
        collection.string('mimeType', { length: 255 }).notNull();
        collection.bigInt('size').notNull();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.integer('ticketId');
        collection.integer('manualId');
        collection.string('category', {
          length: 32,
          nullable: false,
          defaultValue: 'other',
        });
        collection.string('uploadedById', { length: 64 });
        collection.index('ticketId', {
          name: 'service_attachments_ticket_idx',
        });
        collection.index('manualId', {
          name: 'service_attachments_manual_idx',
        });
      },
      { ifNotExists: true },
    );
  },
  async down({ builder }) {
    await builder.dropCollection('serviceAttachments');
  },
});

export default migration;
