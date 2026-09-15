import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609140002_create_support_attachments',

  async up({ builder }) {
    await builder.createCollection('support_attachments', (collection) => {
      // The fixed File repository fields. Their names and types are what the file
      // plugin's repository validates before it stores an upload.
      collection.uuid('id').primary().notNull();
      collection.string('disk', { length: 255 }).notNull();
      collection.text('key').notNull();
      collection.text('filename').notNull();
      collection.string('ext', { length: 32 }).notNull();
      collection.string('mimeType', { length: 255 }).notNull();
      collection.bigInt('size').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      // Business fields. Uploads write only the fixed fields above, so every extra
      // column must be nullable; the application route fills them in afterwards.
      collection.integer('ticketId').nullable();
      collection.string('customerId', { length: 255 }).nullable();
      collection.string('uploadedById', { length: 255 }).nullable();
      collection.string('uploaderRole', { length: 16 }).nullable();
      collection.index('ticketId', { name: 'idx_support_attachments_ticket' });
      collection.index('customerId', {
        name: 'idx_support_attachments_customer',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('support_attachments');
  },
});

export default migration;
